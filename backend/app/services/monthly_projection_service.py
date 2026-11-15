"""Read-only monthly scenarios. Observations are never replaced by estimates.

Coverage is a conservative activity heuristic, not proof of a complete export.

Expense partition (T064 R6): the remaining-period assumptions read the same
``vw_metric_flow_lines`` rows and commitment split as the monthly flow table.
Each expense line goes to exactly one component, in this order:

1. ``commitment_kind = loan`` (loan link) -> loan
2. ``commitment_kind = installment`` (installment link) -> installment
3. unlinked line matching a person-registered loan merchant rule -> loan (R1)
4. unlinked line matching an active installment plan's rule exactly
   (amount, merchant, payment method, schedule) -> installment (R2)
5. ``commitment_kind = recurring`` (T056 recurring commitment) -> recurring
6. unlinked line a person marked as installment
   (``mapping_note = installment_link_unconfirmed``) -> installment
7. everything else (ad hoc protected/adjustable/undecided) -> variable

Rules 3, 4 and 6 only read what a person registered; nothing is inferred or
linked. Lines of a recurring commitment never fall back into the variable
baseline, also after the commitment stopped (R5).
"""

import calendar
from collections import defaultdict
from datetime import date, timedelta
from statistics import median
from typing import Any

from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.auto_classification import LoanMerchantRule
from app.models.installment_plan import InstallmentPlan
from app.models.installment_transaction_link import InstallmentTransactionLink
from app.models.loan import Loan
from app.models.loan_account import LoanAccount
from app.models.nature_axes import RecurringCommitment
from app.models.upload_log import UploadLog
from app.schemas.income_projection import (
    ExpenseProjectionComponent,
    IncomeExpectation,
    IncomeProjectionSource,
    MonthlyProjection,
    ProjectionCommitmentNotInExpense,
    ProjectionCoverage,
    RecurringExpenseProjectionSource,
    income_source_key,
)
from app.services.income_expectations_service import get_income_expectations
from app.services.metric_views import (
    EXPENSE,
    FLOW_LINES_VIEW,
    INCOME,
    METRIC_CURRENCY,
    METRIC_TRANSACTIONS_VIEW,
)

LOOKBACK = 6
MIN_MONTHS = 3
ONEOFF_WORDS = (
    "보너스",
    "상여",
    "성과급",
    "보험금",
    "환급",
    "중고",
    "정산",
    "bonus",
    "refund",
)
SALARY_WORDS = ("급여", "월급", "근로", "salary", "payroll")
RENAMED_PAYER_SOURCE_REASON = (
    "이번 달 이 입금처 급여는 아직 없는데 처음 보는 입금처의 급여 분류 입금이 관측됨; "
    "입금처 이름이 바뀐 같은 급여일 수 있어 예상액을 더하지 않음. "
    "다른 수입이면 설정에서 새 입금처를 예상 수입으로 등록"
)
RENAMED_PAYER_MISSING_REASON = (
    "처음 보는 입금처의 급여 입금과 아직 입금되지 않은 기존 급여 출처가 함께 있어 "
    "기존 출처의 예상액을 보류함; 입금처 이름 변경 여부 확인 필요"
)


def _normalize_row(row: dict[str, Any]) -> dict[str, Any]:
    value = row["date"]
    if not isinstance(value, date):
        row["date"] = date.fromisoformat(str(value))
    return row


def _period(value: date) -> str:
    return value.strftime("%Y-%m")


def _shift_month(value: date, offset: int) -> date:
    absolute = value.year * 12 + value.month - 1 + offset
    year, month_zero = divmod(absolute, 12)
    month = month_zero + 1
    return date(year, month, min(value.day, calendar.monthrange(year, month)[1]))


def _month_end(value: date) -> date:
    return value.replace(day=calendar.monthrange(value.year, value.month)[1])


def _due(value: date, day: int) -> date:
    return value.replace(day=min(day, _month_end(value).day))


def _payer(row: dict[str, Any]) -> str:
    return income_source_key(row["merchant"])


def _oneoff(row: dict[str, Any]) -> bool:
    text = " ".join(
        str(row.get(key) or "")
        for key in (
            "effective_category_major",
            "effective_category_minor",
            "description",
        )
    ).casefold()
    return any(word in text for word in ONEOFF_WORDS)


def _salary(row: dict[str, Any]) -> bool:
    # User category overrides are already resolved by the canonical select.
    text = " ".join(
        str(row.get(key) or "")
        for key in ("effective_category_major", "effective_category_minor")
    ).casefold()
    return any(word in text for word in SALARY_WORDS) and not _oneoff(row)


def covered_periods(
    observed_dates: list[date], periods: list[str]
) -> tuple[list[str], list[str], list[str]]:
    """Activity coverage independently of the projection lookback window."""
    dates_by_month: dict[str, set[date]] = defaultdict(set)
    for observed_date in observed_dates:
        dates_by_month[_period(observed_date)].add(observed_date)
    included, excluded, missing = [], [], []
    for period in periods:
        dates = sorted(dates_by_month[period])
        if not dates:
            missing.append(period)
            excluded.append(period)
            continue
        gaps = [(right - left).days for left, right in zip(dates, dates[1:])]
        if (
            len(dates) >= 8
            and dates[0].day <= 7
            and dates[-1].day >= _month_end(dates[-1]).day - 6
            and max(gaps, default=0) <= 10
        ):
            included.append(period)
        else:
            excluded.append(period)
    return included, excluded, missing


def _coverage(
    rows: list[dict[str, Any]], reference: date, latest_upload: date | None
) -> ProjectionCoverage:
    start = reference.replace(day=1)
    periods = [_period(_shift_month(start, -n)) for n in range(LOOKBACK, 0, -1)]
    included, excluded, missing = covered_periods(
        [row["date"] for row in rows], periods
    )
    return ProjectionCoverage(
        basis="거래 관측 범위 추정: 월 8일 이상, 첫 주·마지막 주 관측, 관측 공백 10일 이하. 전체 계좌·수집 완전성을 보장하지 않음",
        latest_upload_date=latest_upload,
        first_observed_date=min((row["date"] for row in rows), default=None),
        last_observed_date=max((row["date"] for row in rows), default=None),
        adequately_covered_periods=included,
        excluded_periods=excluded,
        missing_periods=missing,
    )


def _covered_day(coverage: ProjectionCoverage, reference: date) -> int:
    """Last day of the reference month already covered by the ledger (T064 R10).

    The remaining period starts the day after the later of the last observed
    transaction and the latest successful upload snapshot not after the as-of
    date. Quiet days inside the export are observed (nothing happened), not
    unobserved. Dates outside the reference month do not count.
    """
    period = _period(reference)
    covered = [
        value
        for value in (coverage.last_observed_date, coverage.latest_upload_date)
        if value is not None and value <= reference and _period(value) == period
    ]
    return max(covered).day if covered else 0


def _stable_history(
    rows: list[dict[str, Any]], periods: list[str], *, income: bool
) -> tuple[int | None, list[str], list[str], list[dict[str, Any]]]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        if _period(row["date"]) in periods:
            grouped[_period(row["date"])].append(row)
    # Tiny salary adjustments cannot become a second monthly salary event.
    positive_maxima = (
        [max(row["amount"] for row in items) for items in grouped.values()]
        if income
        else []
    )
    floor = median(positive_maxima) * 0.1 if positive_maxima else 0
    filtered = {
        period: [row for row in items if not income or row["amount"] >= floor]
        for period, items in grouped.items()
    }
    totals = {
        period: sum(row["amount"] if income else -row["amount"] for row in items)
        for period, items in filtered.items()
    }
    positive = [value for value in totals.values() if value > 0]
    if len(positive) < MIN_MONTHS:
        return None, [], sorted(grouped), []
    baseline = median(positive)
    accepted = [
        period
        for period in periods
        if period in totals and baseline * 0.7 <= totals[period] <= baseline * 1.3
    ]
    excluded = [period for period in periods if period not in accepted]
    if len(accepted) < MIN_MONTHS:
        return None, accepted, excluded, []
    return (
        round(median(totals[period] for period in accepted)),
        accepted,
        excluded,
        [row for period in accepted for row in filtered[period]],
    )


def _income_sources(
    rows: list[dict[str, Any]],
    reference: date,
    coverage: ProjectionCoverage,
    overrides: list[IncomeExpectation],
) -> list[IncomeProjectionSource]:
    period = _period(reference)
    periods = coverage.adequately_covered_periods
    settings = {item.source_key: item for item in overrides}
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    current: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        if row["type"] != "수입" or row["amount"] <= 0 or _oneoff(row):
            continue
        key = _payer(row)
        if not (_salary(row) or key in settings):
            continue
        if _period(row["date"]) == period:
            current[key].append(row)
        else:
            grouped[key].append(row)
    # Salary-category payers seen for the first time this month (no earlier
    # deposit in the window, no user expectation).
    new_payers = {key for key in current if key not in grouped and key not in settings}
    new_salary_amount = sum(row["amount"] for key in new_payers for row in current[key])
    sources = []
    for key in sorted(set(grouped) | set(settings) | set(current)):
        history = grouped[key]
        override = settings.get(key)
        estimate, included, excluded, history_rows = _stable_history(
            history, periods, income=True
        )
        merchant = (
            override.merchant if override else (history or current[key])[0]["merchant"]
        )
        expected_amount = override.expected_amount if override else estimate or 0
        monthly_dates: dict[str, list[date]] = defaultdict(list)
        for row in history_rows:
            monthly_dates[_period(row["date"])].append(row["date"])
        last_dates = [max(dates) for dates in monthly_dates.values()]
        eom = bool(last_dates) and all(
            (_month_end(value) - value).days <= 4 for value in last_dates
        )
        day = (
            override.expected_day
            if override
            else (
                31
                if eom
                else round(median(value.day for value in last_dates))
                if last_dates
                else 1
            )
        )
        due = _due(reference, day) if (estimate is not None or override) else None
        # Split payments can span multiple expected days; keep a visible range.
        first_days = [min(dates).day for dates in monthly_dates.values()]
        first_day = round(median(first_days)) if first_days and not override else day
        date_from = (
            max(
                reference.replace(day=1), _due(reference, first_day) - timedelta(days=4)
            )
            if due
            else None
        )
        date_to = min(_month_end(reference), due + timedelta(days=4)) if due else None
        observed_rows = (
            [row for row in current[key] if row["amount"] >= expected_amount * 0.1]
            if expected_amount
            else current[key]
        )
        observed = sum(row["amount"] for row in observed_rows)
        remaining = max(expected_amount - observed, 0)
        confidence = "medium"
        state, reason = (
            "expected",
            "충분히 관측된 마감월의 동일 입금처·급여 분류·금액 중앙값과 입금일 범위",
        )
        if override:
            reason = "사용자가 확인한 입금처·금액·예정일"
        recent_receipts = [
            row for row in history if periods and _period(row["date"]) == periods[-1]
        ]
        recent_regular_total = sum(
            row["amount"]
            for row in recent_receipts
            if expected_amount * 0.1 <= row["amount"] <= expected_amount * 1.3
        )
        typical_receipt_count = (
            round(median(len(dates) for dates in monthly_dates.values()))
            if monthly_dates
            else 1
        )
        awaiting_split = (
            typical_receipt_count > 1 and len(observed_rows) < typical_receipt_count
        )
        if expected_amount == 0 or (estimate is None and not override):
            state, confidence, remaining = "uncertain", "unavailable", 0
            reason = "안정적인 급여 이력이 3개월 미만이거나 금액 변동이 큼; 설정에서 확인 필요"
        elif override and override.stopped:
            state, remaining, confidence = "stopped", 0, "high"
            reason = "사용자가 예상 수입을 중단함"
        elif not override and not recent_receipts and observed == 0:
            state, remaining, confidence = "stopped", 0, "low"
            reason = "최근 충분히 관측된 마감월에 동일 급여가 없어 자동 전망 중단; 퇴사·지연·누락 여부 확인 필요"
        elif (
            not override
            and periods
            and periods[-1] not in included
            and recent_regular_total < expected_amount * 0.7
            and observed == 0
        ):
            state, remaining, confidence = "uncertain", 0, "low"
            reason = "최근 마감월의 입금 금액이 정기급여 범위와 달라 금액 변경·보너스 여부 확인 필요"
        elif (
            not override
            and len(included) < len(periods) * 0.75
            and not all(
                _period(_shift_month(reference.replace(day=1), -offset)) in included
                for offset in (1, 2, 3)
            )
        ):
            state, remaining, confidence = "uncertain", 0, "low"
            reason = "매월 반복되는 수입으로 보기에는 관측 월이 불연속적임; 분기·비정기 입금 여부 확인 필요"
        elif (
            not override
            and last_dates
            and max(value.day for value in last_dates)
            - min(value.day for value in last_dates)
            > 8
            and not eom
        ):
            state, remaining, confidence = "uncertain", 0, "low"
            reason = "급여 입금일 변동이 커 반복 일정 확인 필요"
        elif 0 < observed < expected_amount and (awaiting_split or override):
            state, confidence = "partial", "low"
            reason = "과거 분할 입금 횟수 또는 사용자 예상 금액에 미달: 확인된 입금만 차감하고 잔여 예상 유지"
        elif observed >= expected_amount * 0.8:
            state, remaining = "received", 0
            reason = (
                "실제 입금(분할 합계 포함)과 대조 완료; 예상 금액을 추가 합산하지 않음"
            )
            if observed > expected_amount * 1.3 or any(
                not (date_from <= row["date"] <= date_to) for row in observed_rows
            ):
                state, confidence = "uncertain", "low"
                reason = "금액 또는 입금일이 과거 범위와 다름; 중복 방지를 위해 추가 예상은 제외하고 확인 필요"
        elif observed > 0:
            state, confidence = "partial", "low"
            reason = "분할 입금 가능성: 실제 입금 합계를 제외한 차액만 예상; 급여 변경 여부 확인 필요"
        if (
            state in {"expected", "partial"}
            and date_to
            and coverage.last_observed_date
            and coverage.last_observed_date > date_to
        ):
            state, confidence = "late", "low"
            reason += "; 예상 입금일 경과, 지연 또는 중단 여부 확인 필요"
        if (
            key not in new_payers
            and state in {"expected", "late"}
            and observed == 0
            and remaining > 0
            and new_salary_amount >= expected_amount * 0.1
        ):
            # T064 R9: a payer rename would otherwise count this month's salary
            # twice (observed under the new name, expected under the old one).
            state, remaining, confidence = "uncertain", 0, "low"
            reason = RENAMED_PAYER_SOURCE_REASON
        sources.append(
            IncomeProjectionSource(
                source_key=key,
                merchant=merchant,
                expected_amount=expected_amount,
                observed_amount=observed,
                remaining_amount=remaining,
                expected_date=due,
                expected_day=day if due else None,
                expected_date_from=date_from,
                expected_date_to=date_to,
                status=state,
                confidence=confidence,
                history_periods=included,
                excluded_periods=excluded,
                matched_transaction_ids=[row["id"] for row in observed_rows],
                reason=reason,
            )
        )
    return sources


def _plan_matches(row: dict[str, Any], plan: InstallmentPlan) -> bool:
    end = _shift_month(plan.first_payment_date, plan.total_installments - 1)
    due = _due(row["date"], plan.first_payment_date.day)
    return (
        abs(row["amount"]) == plan.monthly_amount
        and abs((row["date"] - due).days) <= 7
        and income_source_key(row["merchant"]) == income_source_key(plan.merchant)
        and (
            not plan.payment_method or row.get("payment_method") == plan.payment_method
        )
        and plan.first_payment_date.replace(day=1) <= row["date"] <= _month_end(end)
    )


def _commitment_name(
    commitment: RecurringCommitment | None, items: list[dict[str, Any]]
) -> str:
    if commitment is None:
        return items[0]["merchant"]
    if commitment.match_scope == "merchant" and commitment.merchant:
        return commitment.merchant
    return commitment.label or " / ".join(
        part for part in (commitment.category_major, commitment.category_minor) if part
    )


def _recurring_source(
    items: list[dict[str, Any]],
    reference: date,
    coverage: ProjectionCoverage,
    observed_day: int,
    commitment: RecurringCommitment | None = None,
) -> RecurringExpenseProjectionSource | None:
    """Separate paid cash and refunds before estimating additional payments.

    ``items`` are the flow lines of one registered recurring commitment
    (T064 R6). A weak current recurrence registered with a monthly cycle can
    yield a low-confidence scenario. Historical-only weak recurrences stay
    inactive; refunds never reinstate a payment already observed. A commitment
    end date (T056 attribute) caps the remaining days (R5). Income stability
    rules remain unchanged.
    """
    explicit_monthly = commitment is not None and commitment.cycle == "monthly"
    end_date = commitment.end_date if commitment is not None else None
    period = _period(reference)
    periods = coverage.adequately_covered_periods
    current = [row for row in items if _period(row["date"]) == period]
    if end_date is not None and end_date < reference.replace(day=1) and not current:
        return None
    payments = [row for row in items if row["amount"] < 0]
    estimate, included, excluded, selected_rows = _stable_history(
        payments, periods, income=False
    )
    previous_period = _period(_shift_month(reference.replace(day=1), -1))
    stable_recent = estimate is not None and previous_period in included
    stable_before_coverage_gap = (
        estimate is not None
        and previous_period not in periods
        and bool(periods)
        and periods[-1] in included
    )
    warnings = []
    confidence = "medium"
    basis = "충분히 관측된 마감월의 총결제액 중앙값. 환급은 결제액에서 차감하지 않음"
    if stable_before_coverage_gap:
        # Incomplete exports are not evidence that a subscription stopped. Keep
        # the latest adequately observed stable pattern, with lower confidence.
        # A missing payment in that adequately covered month still fails this
        # branch and follows the existing inactive/current-evidence rules.
        confidence = "low"
        warnings.append(
            "직전 마감월의 전체 거래 관측이 부족하여 중단 여부를 판단할 수 없음; 마지막 충분히 관측된 월까지의 안정 이력을 사용함"
        )
    elif not stable_recent:
        if not current or not explicit_monthly:
            return None
        confidence = "low"
        if estimate is not None:
            warnings.append(
                "직전 마감월의 결제액이 안정 범위를 벗어나거나 관측되지 않아 이전 안정 이력을 사용함"
            )
        else:
            totals: dict[str, int] = defaultdict(int)
            for row in payments:
                if _period(row["date"]) in periods:
                    totals[_period(row["date"])] -= row["amount"]
            # Prefer the accepted subset when the stability filter retained
            # fewer than three months, otherwise use available gross payments.
            included = included or sorted(totals)
            selected_rows = [
                row for row in payments if _period(row["date"]) in included
            ]
            excluded = [value for value in periods if value not in included]
            if included:
                estimate = round(median(totals[value] for value in included))
                warnings.append(
                    "최근 안정적인 3개월 결제 이력이 부족하여 관측된 과거 총결제액으로 낮은 신뢰도 추정"
                )
    paid = sum(-row["amount"] for row in current if row["amount"] < 0)
    refunded = sum(row["amount"] for row in current if row["amount"] > 0)
    if estimate is None and paid:
        estimate = paid
        remaining = 0
        basis = "과거 결제 근거가 없어 이번 달 명시적 반복 결제를 이번 주기 관측액으로 사용; 추가 결제는 가정하지 않음"
        warnings.append(
            "과거 결제 이력이 없어 이번 달 관측 결제만 반영함; 같은 달 추가 결제 여부 확인 필요"
        )
    elif estimate is None:
        remaining = None
        confidence = "unavailable"
        basis = "충분히 관측된 과거월과 이번 달에 총결제 근거가 없음"
        warnings.append(
            "환급만으로 월 결제 기준액이나 잔여 지출을 추정할 수 없음"
            if refunded
            else "총결제 근거가 없어 월 결제 기준액이나 잔여 지출을 추정할 수 없음"
        )
    else:
        # R5: no payment is assumed after a registered commitment end date.
        last_day = (
            min(end_date.day, _month_end(reference).day)
            if end_date is not None and _period(end_date) == period
            else 0
            if end_date is not None and end_date < reference.replace(day=1)
            else _month_end(reference).day
        )

        def tail_median(through_day: int) -> int:
            return round(
                median(
                    sum(
                        -row["amount"]
                        for row in selected_rows
                        if _period(row["date"]) == value
                        and observed_day
                        < min(row["date"].day, _month_end(reference).day)
                        <= through_day
                    )
                    for value in included
                )
            )

        uncapped = min(max(estimate - paid, 0), tail_median(_month_end(reference).day))
        remaining = min(uncapped, tail_median(last_day))
        basis += "; 월 기준액에서 이미 결제한 금액을 뺀 차액과 과거 동일 잔여 날짜 결제액 중앙값 중 작은 금액만 추가 예상"
        if end_date is not None and last_day < _month_end(reference).day:
            basis += f"; 약정 종료일 {end_date.isoformat()} 뒤의 결제는 가정하지 않음"
        # Use the same lower bound as the history stability band. Small FX or
        # billing differences do not imply a missing installment, but a large
        # shortfall after the observed payment dates still needs review.
        if uncapped == 0 and paid < estimate * 0.7:
            warnings.append(
                "과거 납부일 이후 이번 달 결제가 관측되지 않아 추가 청구를 가정하지 않음; 결제 누락·중단 여부 확인 필요"
                if paid == 0
                else "과거 납부일 이후 이번 달 결제액이 월 기준에 크게 미달함; 추가 청구를 가정하지 않으며 분할 결제 누락·금액 변경 여부 확인 필요"
            )
    additional = max(paid - estimate, 0) if estimate is not None else 0
    if refunded:
        warnings.append(
            "이번 달 환급은 관측 순지출에 반영했으며 새로운 납부 의무로 가정하지 않음; 재청구 여부 확인 필요"
        )
    if additional:
        warnings.append(
            "월 기준을 초과한 결제는 관측 지출에 포함됨; 추가 청구·금액 변경 여부 확인 필요"
        )
    if warnings and confidence != "unavailable":
        confidence = "low"
    name = _commitment_name(commitment, items)
    return RecurringExpenseProjectionSource(
        source_key="expense:" + " ".join(name.lower().split()),
        merchant=name,
        expected_monthly_amount=estimate,
        observed_payment_amount=paid,
        observed_refund_amount=refunded,
        observed_net_expense=paid - refunded,
        expected_remaining=remaining,
        additional_observed_amount=additional,
        confidence=confidence,
        status="review" if warnings else "expected" if remaining else "observed",
        basis=basis,
        history_periods=included,
        excluded_periods=sorted(set(excluded) | set(coverage.excluded_periods)),
        warnings=warnings,
        commitment_id=commitment.id if commitment is not None else None,
        cycle=commitment.cycle if commitment is not None else None,  # type: ignore[arg-type]
        end_date=end_date,
    )


LOAN_NOT_IN_EXPENSE_REASON = (
    "최근 충분히 관측된 마감월과 이번 달 흐름표에 이 대출의 지출 줄(연결 또는 대출 "
    "거래처 규칙)이 없어 지출 가정에 더하지 않음; 상환이 이체로 기록되거나 장부 밖 "
    "계좌에서 나가거나 연결이 빠졌을 수 있음"
)
LOAN_WITHOUT_ACCOUNT_REASON = (
    "대출 계좌가 등록되지 않아 연결·규칙으로 지출 줄을 찾을 수 없어 지출 가정에 "
    "더하지 않음"
)


def _loan_name(loan: Loan, account: LoanAccount | None) -> str:
    if account is not None and account.display_name_user:
        return account.display_name_user
    return f"{loan.lender} {loan.product_name}"


def _loan_rule_account(
    row: dict[str, Any], rules: list[LoanMerchantRule]
) -> int | None:
    """Loan account of a person-registered loan merchant rule (exact match)."""
    for rule in rules:
        value = (
            row.get("description")
            if rule.match_field == "description"
            else (row.get("merchant"))
        )
        if value is not None and value == rule.merchant:
            return rule.loan_account_id
    return None


def _partition_lines(
    lines: list[dict[str, Any]],
    reference: date,
    plans: list[InstallmentPlan],
    loan_rules: list[LoanMerchantRule],
    reasons: dict[str, list[str]],
) -> dict[str, list[dict[str, Any]]]:
    """Exclusive expense partition of flow lines (T064 R6, module docstring)."""
    period = _period(reference)
    partitions: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in lines:
        commitment_kind = row.get("commitment_kind")
        row["_rule"] = False
        row["_loan_account"] = row.get("loan_account_id")
        kind: str
        if commitment_kind == "loan":
            kind = "loan"
        elif commitment_kind == "installment":
            kind = "installment"
        elif (account_id := _loan_rule_account(row, loan_rules)) is not None:
            kind = "loan"
            row["_rule"] = True
            row["_loan_account"] = account_id
        elif any(_plan_matches(row, plan) for plan in plans):
            kind = "installment"
            row["_rule"] = True
        elif commitment_kind == "recurring":
            kind = "recurring"
        elif row.get("mapping_note") == "installment_link_unconfirmed":
            kind = "installment"
            if _period(row["date"]) == period:
                reasons[kind].append(
                    "할부 분류 거래에 연결된 상환 일정이 없어 잔여 할부 확인 필요"
                )
        else:
            kind = "variable"
        row["_part"] = kind
        partitions[kind].append(row)
    return partitions


def _expense_components(
    lines: list[dict[str, Any]],
    reference: date,
    coverage: ProjectionCoverage,
    loans: list[tuple[Loan, LoanAccount | None]],
    plans: list[InstallmentPlan],
    links: list[InstallmentTransactionLink],
    commitments: dict[int, RecurringCommitment],
    loan_rules: list[LoanMerchantRule],
) -> list[ExpenseProjectionComponent]:
    period = _period(reference)
    current_start = reference.replace(day=1)
    covered_day = _covered_day(coverage, reference)
    periods = coverage.adequately_covered_periods
    # Self lines carry the transaction; refund allocation lines only move a
    # refund's meaning onto the original purchase.
    by_id = {
        row["transaction_id"]: row
        for row in lines
        if row.get("line_kind") != "refund_allocation"
    }
    link_map = {link.transaction_id: link for link in links}
    reasons: dict[str, list[str]] = defaultdict(list)
    partitions = _partition_lines(lines, reference, plans, loan_rules, reasons)

    # Loan (R1): registered loan accounts, linked or rule-matched lines.
    loan_rows: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for row in partitions["loan"]:
        loan_rows[row["_loan_account"]].append(row)
    check_periods = sorted(
        {periods[-1] if periods else _period(_shift_month(current_start, -1)), period}
    )
    loan_remaining = 0
    loan_warnings: list[str] = []
    not_in_expense: list[ProjectionCommitmentNotInExpense] = []
    loan_unconfirmed: list[dict[str, Any]] = []
    included_loans = 0
    for loan, account in loans:
        if loan.balance is not None and loan.balance <= 0:
            continue
        name = _loan_name(loan, account)
        monthly = (
            round(loan.monthly_payment) if loan.monthly_payment is not None else None
        )
        rows = loan_rows.get(account.id, []) if account is not None else []
        if not any(
            row["amount"] < 0 and _period(row["date"]) in check_periods for row in rows
        ):
            no_account = account is None
            not_in_expense.append(
                ProjectionCommitmentNotInExpense(
                    name=name,
                    loan_account_id=account.id if account is not None else None,
                    monthly_amount=monthly,
                    checked_periods=check_periods,
                    reason_code="no_loan_account"
                    if no_account
                    else "no_expense_line_in_recent_month",
                    reason=LOAN_WITHOUT_ACCOUNT_REASON
                    if no_account
                    else LOAN_NOT_IN_EXPENSE_REASON,
                )
            )
            loan_warnings.append(
                f"{name}: "
                + (
                    LOAN_WITHOUT_ACCOUNT_REASON
                    if no_account
                    else LOAN_NOT_IN_EXPENSE_REASON
                )
            )
            continue
        included_loans += 1
        current_rows = [row for row in rows if _period(row["date"]) == period]
        paid = sum(-row["amount"] for row in current_rows)
        unconfirmed = [row for row in current_rows if row["_rule"]]
        if unconfirmed:
            loan_unconfirmed.extend(unconfirmed)
            loan_warnings.append(
                f"{name}: 대출 거래처 규칙에 맞지만 연결되지 않은 이번 달 상환을 관측 상환으로 봄; "
                "연결 확인 필요"
            )
        if monthly is None:
            reasons["loan"].append("월상환액을 확인할 수 없는 대출이 있음")
        else:
            loan_remaining += max(monthly - paid, 0)
    if included_loans:
        # An unlinked loan-looking payment could be one of the loans added
        # above; it cannot be told apart without a link or a rule.
        for row in lines:
            category = str(row.get("effective_category_minor") or "") + str(
                row.get("effective_category_major") or ""
            )
            if (
                row["_part"] != "loan"
                and "대출" in category
                and _period(row["date"]) == period
            ):
                reasons["loan"].append(
                    "대출 관련 관측 거래에 계좌 연결이 없어 중복 여부 확인 필요"
                )

    installment_remaining = 0
    installment_warnings: list[str] = []
    installment_unconfirmed: list[dict[str, Any]] = []
    used_actual_ids: set[int] = set()
    for plan in plans:
        offset = (
            (reference.year - plan.first_payment_date.year) * 12
            + reference.month
            - plan.first_payment_date.month
        )
        if offset < 0 or offset >= plan.total_installments:
            continue
        number = offset + 1
        due = _shift_month(plan.first_payment_date, offset)
        plan_links = [
            link
            for link in links
            if link.installment_plan_id == plan.id and link.transaction_id in by_id
        ]
        # T064 R3: this month's occurrence is a payment linked to the plan and
        # dated in this month, whatever installment number the link carries. A
        # different number only raises a warning. Without such a payment, the
        # link of the computed number (any month in the window) still counts.
        matched_links = [
            link
            for link in plan_links
            if _period(by_id[link.transaction_id]["date"]) == period
        ] or [link for link in plan_links if link.installment_number == number]
        if any(link.installment_number != number for link in matched_links):
            installment_warnings.append(
                f"{plan.display_name}: 이번 달 연결 거래의 회차 번호가 계산한 회차({number}회차)와 다름; "
                "이번 달 회차로 보고 예정액을 다시 더하지 않음. 첫 납부일·연결 회차 확인 필요"
            )
        matched = [by_id[link.transaction_id] for link in matched_links]
        if any(row.get("loan_account_id") is not None for row in matched):
            reasons["installment"].append(
                "같은 거래가 대출과 할부에 연결되어 상환 일정 중복 확인 필요"
            )
            continue
        # Read-only reconciliation (R2): exact plan payer/method, date, and
        # amount. Never create a mapping automatically; show it as unconfirmed.
        if not matched:
            candidates = [
                row
                for row in partitions["installment"]
                if row["transaction_id"] not in used_actual_ids
                and row["transaction_id"] not in link_map
                and row.get("line_kind") != "refund_allocation"
                and _plan_matches(row, plan)
                and _period(row["date"]) == period
                and abs((row["date"] - due).days) <= 7
                and -row["amount"] == plan.monthly_amount
            ]
            if len(candidates) == 1:
                matched = candidates
                installment_unconfirmed.extend(candidates)
                installment_warnings.append(
                    f"{plan.display_name}: 연결되지 않은 이번 달 결제를 계획 규칙(금액·거래처·"
                    "결제수단·예정일) 일치로 이번 달 회차로 봄; 연결 확인 필요"
                )
            elif len(candidates) > 1:
                reasons["installment"].append(
                    "할부 예정액과 일치하는 실제 거래가 여러 건이어서 연결 확인 필요"
                )
                continue
        used_actual_ids.update(row["transaction_id"] for row in matched)
        if matched:
            installment_remaining += max(
                plan.monthly_amount - sum(-row["amount"] for row in matched), 0
            )
        elif due < current_start + timedelta(days=max(covered_day - 1, 0)):
            reasons["installment"].append(
                "예정일이 지난 미연결 할부는 미래 지출로 더하지 않음; 실제 결제 여부 확인 필요"
            )
        else:
            installment_remaining += plan.monthly_amount

    recurring_remaining = 0
    recurring_sources = []
    commitment_rows: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for row in partitions["recurring"]:
        commitment_rows[row["recurring_commitment_id"]].append(row)
    for commitment_id, items in sorted(commitment_rows.items()):
        source = _recurring_source(
            items, reference, coverage, covered_day, commitments.get(commitment_id)
        )
        if source is None:
            # R5: a commitment's history never falls back into the variable
            # baseline, also after it stopped.
            continue
        recurring_sources.append(source)
        if source.expected_remaining is None:
            reasons["recurring"].append(
                f"{source.merchant}: 반복 지출의 총결제 근거가 없어 잔여 지출 추정 불가"
            )
        else:
            recurring_remaining += source.expected_remaining
    seen_keys: set[str] = set()
    for source in recurring_sources:
        if source.source_key in seen_keys:
            source.source_key += f"#{source.commitment_id}"
        seen_keys.add(source.source_key)

    variable_remaining = None
    if len(periods) >= MIN_MONTHS:
        tails = [
            sum(
                -row["amount"]
                for row in partitions["variable"]
                if _period(row["date"]) == baseline_period
                and min(row["date"].day, _month_end(reference).day) > covered_day
            )
            for baseline_period in periods
        ]
        variable_remaining = max(round(median(tails)), 0)
    else:
        reasons["variable"].append(
            "충분히 관측된 마감월 3개월이 없어 잔여 변동·미분류 지출 추정 불가"
        )
    values = {
        "loan": loan_remaining,
        "installment": installment_remaining,
        "recurring": recurring_remaining,
        "variable": variable_remaining,
    }
    snapshot_dates = sorted({loan.snapshot_date.isoformat() for loan, _ in loans})
    bases = {
        "loan": f"대출 스냅샷 {', '.join(snapshot_dates) or '없음'}의 월상환액 - 이번 달 그 대출 계좌에 연결되거나 사람이 등록한 대출 거래처 규칙에 맞는 실제 상환. 최근 충분히 관측된 마감월과 이번 달 흐름표에 지출 줄이 없는 대출은 더하지 않고 따로 보임; 상환일 정보는 없음",
        "installment": "활성 할부 일정의 이번 달 예정액 - 실제 연결 또는 계획 규칙(금액·거래처·결제수단·일정) 일치 결제(연결 미확인); 지난 미연결 회차는 확인 필요",
        "recurring": "등록된 정기 지급 묶음(흐름표 committed_recurring 줄)별 과거 총결제액과 이미 결제한 금액, 동일 잔여 날짜 결제 패턴으로 추가 지출 추정. 끝난 묶음의 이력은 변동 기준선에 넣지 않음. 환급은 관측 순지출에만 반영; 이력 부족은 항목별 낮은 신뢰도로 표시",
        "variable": "흐름표의 약정 아닌 지출 줄(보호·조정 가능·미정) 중 대출 거래처 규칙·할부 계획 규칙·할부 표시에 맞는 결제를 뺀 나머지의 동일 잔여 일자 구간 중앙값; 환급 포함",
    }
    recurring_warnings = sorted(
        {
            f"{source.merchant}: {warning}"
            for source in recurring_sources
            for warning in source.warnings
        }
    )
    component_warnings = {
        "loan": sorted(set(loan_warnings)),
        "installment": sorted(set(installment_warnings)),
        "recurring": recurring_warnings,
    }
    unconfirmed = {"loan": loan_unconfirmed, "installment": installment_unconfirmed}
    return [
        ExpenseProjectionComponent(
            kind=kind,
            expected_remaining=None if reasons[kind] else values[kind],
            known_expected_remaining=values[kind] or 0,
            basis=bases[kind],
            missing_reasons=sorted(set(reasons[kind])),
            confidence="unavailable"
            if reasons[kind]
            else "low"
            if component_warnings.get(kind)
            else "medium",
            warnings=component_warnings.get(kind, []),
            sources=recurring_sources if kind == "recurring" else [],
            link_unconfirmed_count=len(unconfirmed.get(kind, [])),
            link_unconfirmed_amount=sum(
                -row["amount"] for row in unconfirmed.get(kind, [])
            ),
            not_in_expense_commitments=not_in_expense if kind == "loan" else [],
        )
        for kind in ("loan", "installment", "recurring", "variable")
    ]


async def _load_expense_lines(
    db_session: AsyncSession, start: date, reference: date
) -> list[dict[str, Any]]:
    """Expense rows of ``vw_metric_flow_lines`` (KRW) in ``[start, reference]``."""
    lines = FLOW_LINES_VIEW
    result = await db_session.execute(
        select(
            lines.c.transaction_id,
            lines.c.attributed_transaction_id,
            lines.c.line_kind,
            lines.c.date,
            lines.c.amount,
            lines.c.merchant,
            lines.c.description,
            lines.c.payment_method,
            lines.c.effective_category_major,
            lines.c.effective_category_minor,
            lines.c.loan_account_id,
            lines.c.installment_plan_id,
            lines.c.commitment_kind,
            lines.c.adjustability,
            lines.c.recurring_commitment_id,
            lines.c.mapping_note,
        )
        .where(lines.c.type == EXPENSE, lines.c.date >= start)
        .where(lines.c.date <= reference)
        .order_by(lines.c.date, lines.c.time, lines.c.transaction_id, lines.c.line_kind)
    )
    return [_normalize_row(dict(row)) for row in result.mappings()]


async def get_monthly_projection(
    db_session: AsyncSession, *, reference_date: date
) -> MonthlyProjection:
    month_start = reference_date.replace(day=1)
    start = _shift_month(month_start, -LOOKBACK)
    # Same effective basis as the metric views (no deleted/merged/superseded
    # rows, KRW only).
    effective = METRIC_TRANSACTIONS_VIEW
    result = await db_session.execute(
        select(effective)
        .where(func.upper(effective.c.currency) == METRIC_CURRENCY)
        .where(effective.c.date >= start, effective.c.date <= reference_date)
        .order_by(effective.c.date, effective.c.time, effective.c.id)
    )
    rows = [_normalize_row(dict(row)) for row in result.mappings()]
    upload = await db_session.scalar(
        select(UploadLog.snapshot_date)
        .where(
            UploadLog.status.in_(["success", "completed"]),
            UploadLog.snapshot_date <= reference_date,
        )
        .order_by(UploadLog.uploaded_at.desc(), UploadLog.id.desc())
        .limit(1)
    )
    coverage = _coverage(rows, reference_date, upload)
    overrides = await get_income_expectations(db_session)
    sources = _income_sources(rows, reference_date, coverage, overrides.items)
    loan_result = await db_session.execute(
        select(Loan, LoanAccount)
        .outerjoin(
            LoanAccount,
            (LoanAccount.lender == Loan.lender)
            & (LoanAccount.product_name == Loan.product_name),
        )
        .where(
            Loan.snapshot_date
            == select(func.max(Loan.snapshot_date))
            .where(Loan.snapshot_date <= reference_date)
            .scalar_subquery()
        )
        .order_by(Loan.snapshot_date.desc())
    )
    latest_loans: dict[tuple[str, str], tuple[Loan, LoanAccount | None]] = {}
    for loan, account in loan_result.all():
        latest_loans.setdefault((loan.lender, loan.product_name), (loan, account))
    plans = list(
        (
            await db_session.scalars(
                select(InstallmentPlan).where(InstallmentPlan.status == "active")
            )
        ).all()
    )
    links = list((await db_session.scalars(select(InstallmentTransactionLink))).all())
    expense_lines = await _load_expense_lines(db_session, start, reference_date)
    commitment_ids = {
        row["recurring_commitment_id"]
        for row in expense_lines
        if row.get("recurring_commitment_id") is not None
    }
    commitments = (
        {
            item.id: item
            for item in (
                await db_session.scalars(
                    select(RecurringCommitment).where(
                        RecurringCommitment.id.in_(commitment_ids)
                    )
                )
            ).all()
        }
        if commitment_ids
        else {}
    )
    loan_rules = list(
        (
            await db_session.scalars(
                select(LoanMerchantRule).order_by(LoanMerchantRule.id)
            )
        ).all()
    )
    components = _expense_components(
        expense_lines,
        reference_date,
        coverage,
        list(latest_loans.values()),
        plans,
        links,
        commitments,
        loan_rules,
    )
    lines = FLOW_LINES_VIEW
    observed = (
        await db_session.execute(
            select(
                func.coalesce(
                    func.sum(case((lines.c.type == INCOME, lines.c.amount), else_=0)),
                    0,
                ).label("income"),
                func.coalesce(
                    func.sum(case((lines.c.type == EXPENSE, -lines.c.amount), else_=0)),
                    0,
                ).label("expense"),
            ).where(lines.c.date >= month_start, lines.c.date <= reference_date)
        )
    ).one()
    # Observed actuals come from the monthly-flow lines (same definition as
    # /metrics/monthly-flow income_total and total_outflow).
    observed_income = int(observed.income or 0)
    observed_expense = int(observed.expense or 0)
    remaining_income = sum(source.remaining_amount for source in sources)
    reasons = [
        reason for component in components for reason in component.missing_reasons
    ]
    warnings = [warning for component in components for warning in component.warnings]
    if not sources:
        reasons.append(
            "정기 수입을 식별할 급여 이력이나 사용자 예상 설정이 없음; 기타 수입은 반복하지 않음"
        )
    if any(
        source.status in {"uncertain", "late", "partial", "stopped"}
        for source in sources
    ):
        reasons.append("확인이 필요한 급여 출처가 있음; 출처별 상태와 제외 사유 참고")
    if any(source.reason == RENAMED_PAYER_SOURCE_REASON for source in sources):
        reasons.append(RENAMED_PAYER_MISSING_REASON)
    stale = (
        coverage.last_observed_date is None
        or (reference_date - coverage.last_observed_date).days > 7
    )
    if stale:
        reasons.append(
            "최신 관측 거래가 기준일보다 7일 이상 오래되어 월말 전망을 제공하지 않음"
        )
    remaining_expense = (
        sum(
            component.expected_remaining
            for component in components
            if component.expected_remaining is not None
        )
        if all(component.expected_remaining is not None for component in components)
        and not stale
        else None
    )
    known_remaining_expense = sum(
        component.known_expected_remaining for component in components
    )
    projected_income = observed_income + remaining_income
    remaining_start = month_start + timedelta(
        days=_covered_day(coverage, reference_date)
    )
    projected_expense = (
        observed_expense + remaining_expense if remaining_expense is not None else None
    )
    return MonthlyProjection(
        period=_period(reference_date),
        as_of_date=reference_date,
        observed_through=coverage.last_observed_date,
        remaining_period_start=remaining_start
        if remaining_start <= _month_end(reference_date)
        else None,
        observed_income=observed_income,
        expected_remaining_income=remaining_income,
        projected_month_income=projected_income,
        observed_net_expense=observed_expense,
        expected_remaining_expense=remaining_expense,
        known_expected_remaining_expense=known_remaining_expense,
        net_after_known_remaining_expense=projected_income
        - observed_expense
        - known_remaining_expense,
        projected_month_expense=projected_expense,
        observed_net_cashflow=observed_income - observed_expense,
        projected_month_end_net=projected_income - projected_expense
        if projected_expense is not None
        else None,
        confidence="unavailable"
        if projected_expense is None
        else "low"
        if reasons or warnings
        else "medium",
        included_periods=coverage.adequately_covered_periods,
        excluded_periods=coverage.excluded_periods,
        missing_reasons=sorted(set(reasons)),
        warnings=sorted(set(warnings)),
        limitations=[
            "월간 수입·지출 시나리오이며 현재 현금 잔액이나 확정 잔액 예측이 아님",
            "과거 관측 패턴은 예정 계약을 보장하지 않음; 보너스·보험금·환급·중고판매·소액 급여정산은 자동 반복 수입에서 제외",
            "관측 공백·미연결 상환·새 지출·향후 금액 변경으로 전망이 달라질 수 있음",
            "잔여 지출은 대출, 할부, 반복결제, 나머지 변동·미분류의 순서로 중복 없이 배정",
        ],
        income_sources=sources,
        expense_components=components,
        coverage=coverage,
    )
