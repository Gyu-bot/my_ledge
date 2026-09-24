"""Read-only monthly scenarios. Observations are never replaced by estimates.

Coverage is a conservative activity heuristic, not proof of a complete export.
Loan > installment > recurring > residual spend is an exclusive partition.
"""

import calendar
from collections import defaultdict
from datetime import date, timedelta
from statistics import median
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.installment_plan import InstallmentPlan
from app.models.installment_transaction_link import InstallmentTransactionLink
from app.models.loan import Loan
from app.models.loan_account import LoanAccount
from app.models.upload_log import UploadLog
from app.schemas.income_projection import (
    ExpenseProjectionComponent,
    IncomeExpectation,
    IncomeProjectionSource,
    MonthlyProjection,
    ProjectionCoverage,
    income_source_key,
)
from app.services.canonical_views import build_transactions_effective_select
from app.services.income_expectations_service import get_income_expectations

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


def _expense_components(
    rows: list[dict[str, Any]],
    reference: date,
    coverage: ProjectionCoverage,
    loans: list[tuple[Loan, LoanAccount | None]],
    plans: list[InstallmentPlan],
    links: list[InstallmentTransactionLink],
) -> list[ExpenseProjectionComponent]:
    period = _period(reference)
    current_start = reference.replace(day=1)
    observed_day = (
        coverage.last_observed_date.day
        if coverage.last_observed_date
        and _period(coverage.last_observed_date) == period
        else 0
    )
    expenses = [row for row in rows if row["type"] == "지출"]
    by_id = {row["id"]: row for row in expenses}
    link_map = {link.transaction_id: link for link in links}
    partitions: dict[str, list[dict[str, Any]]] = defaultdict(list)
    reasons: dict[str, list[str]] = defaultdict(list)
    recurring_payers = {
        _payer(row)
        for row in expenses
        if row.get("cost_kind") == "fixed"
        or row.get("recurring_payment_kind") == "monthly_recurring"
    }
    for row in expenses:
        if row.get("loan_account_id") is not None:
            kind = "loan"
        elif row["id"] in link_map or any(_plan_matches(row, plan) for plan in plans):
            kind = "installment"
        elif row.get("recurring_payment_kind") == "installment":
            kind = "installment"
            if _period(row["date"]) == period:
                reasons[kind].append(
                    "할부 분류 거래에 연결된 상환 일정이 없어 잔여 할부 확인 필요"
                )
        elif _payer(row) in recurring_payers:
            kind = "recurring"
        else:
            kind = "variable"
        partitions[kind].append(row)
        category = str(row.get("effective_category_minor") or "") + str(
            row.get("effective_category_major") or ""
        )
        if (
            "대출" in category
            and row.get("loan_account_id") is None
            and _period(row["date"]) == period
        ):
            reasons["loan"].append(
                "대출 관련 관측 거래에 계좌 연결이 없어 중복 여부 확인 필요"
            )

    loan_remaining = 0
    for loan, account in loans:
        if loan.balance is not None and loan.balance <= 0:
            continue
        paid = sum(
            -row["amount"]
            for row in partitions["loan"]
            if account
            and row.get("loan_account_id") == account.id
            and _period(row["date"]) == period
        )
        if loan.monthly_payment is None:
            reasons["loan"].append("월상환액을 확인할 수 없는 대출이 있음")
        else:
            loan_remaining += max(round(loan.monthly_payment) - paid, 0)
    installment_remaining = 0
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
        matched_links = [
            link
            for link in links
            if link.installment_plan_id == plan.id
            and link.installment_number == number
            and link.transaction_id in by_id
        ]
        matched = [by_id[link.transaction_id] for link in matched_links]
        if any(row.get("loan_account_id") is not None for row in matched):
            reasons["installment"].append(
                "같은 거래가 대출과 할부에 연결되어 상환 일정 중복 확인 필요"
            )
            continue
        # Read-only reconciliation: exact plan payer/method, date, and amount.
        # Never create a mapping automatically.
        if not matched:
            candidates = [
                row
                for row in partitions["installment"]
                if row["id"] not in used_actual_ids
                and row["id"] not in link_map
                and _plan_matches(row, plan)
                and _period(row["date"]) == period
                and abs((row["date"] - due).days) <= 7
                and -row["amount"] == plan.monthly_amount
            ]
            if len(candidates) == 1:
                matched = candidates
            elif len(candidates) > 1:
                reasons["installment"].append(
                    "할부 예정액과 일치하는 실제 거래가 여러 건이어서 연결 확인 필요"
                )
                continue
        used_actual_ids.update(row["id"] for row in matched)
        if matched:
            installment_remaining += max(
                plan.monthly_amount - sum(-row["amount"] for row in matched), 0
            )
        elif due < current_start + timedelta(days=max(observed_day - 1, 0)):
            reasons["installment"].append(
                "예정일이 지난 미연결 할부는 미래 지출로 더하지 않음; 실제 결제 여부 확인 필요"
            )
        else:
            installment_remaining += plan.monthly_amount

    recurring_remaining = 0
    merchant_rows: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in partitions["recurring"]:
        merchant_rows[_payer(row)].append(row)
    for items in merchant_rows.values():
        estimate, included, _, _ = _stable_history(
            items, coverage.adequately_covered_periods, income=False
        )
        if (
            estimate is None
            or not coverage.adequately_covered_periods
            or coverage.adequately_covered_periods[-1] not in included
        ):
            explicit_recurring = any(
                row.get("recurring_payment_kind") == "monthly_recurring"
                for row in items
            )
            if explicit_recurring and any(
                _period(row["date"]) == period for row in items
            ):
                reasons["recurring"].append(
                    "명시적으로 반복 분류된 일부 지출의 최근 안정적인 3개월 이력이 부족함"
                )
            elif not explicit_recurring:
                # One-off or variable fixed classifications must not invalidate
                # all forecasts; estimate their residual days with other spend.
                partitions["variable"].extend(items)
            continue
        paid = sum(-row["amount"] for row in items if _period(row["date"]) == period)
        recurring_remaining += max(estimate - paid, 0)

    variable_remaining = None
    if len(coverage.adequately_covered_periods) >= MIN_MONTHS:
        tails = [
            sum(
                -row["amount"]
                for row in partitions["variable"]
                if _period(row["date"]) == baseline_period
                and min(row["date"].day, _month_end(reference).day) > observed_day
            )
            for baseline_period in coverage.adequately_covered_periods
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
        "loan": f"대출 스냅샷 {', '.join(snapshot_dates) or '없음'}의 월상환액 - 이번 달 해당 계좌에 연결된 실제 상환; 상환일 정보는 없음",
        "installment": "활성 할부 일정의 이번 달 예정액 - 실제 연결 또는 금액·입금처·일정 일치 결제; 지난 미연결 회차는 확인 필요",
        "recurring": "최근 충분히 관측된 3개월 이상 동일 거래처 반복 순지출 중앙값 - 이번 달 실제 순지출; 확정 계약이 아닌 관측 패턴",
        "variable": "대출·할부·안정적 반복 지출을 제외한 변동·미분류·비정기 고정 지출의 동일 잔여 일자 구간 중앙값; 환급 포함",
    }
    return [
        ExpenseProjectionComponent(
            kind=kind,
            expected_remaining=None if reasons[kind] else values[kind],
            known_expected_remaining=values[kind] or 0,
            basis=bases[kind],
            missing_reasons=sorted(set(reasons[kind])),
        )
        for kind in ("loan", "installment", "recurring", "variable")
    ]


async def get_monthly_projection(
    db_session: AsyncSession, *, reference_date: date
) -> MonthlyProjection:
    month_start = reference_date.replace(day=1)
    start = _shift_month(month_start, -LOOKBACK)
    effective = build_transactions_effective_select().subquery()
    result = await db_session.execute(
        select(effective).where(
            effective.c.date >= start, effective.c.date <= reference_date
        )
    )
    rows = [dict(row) for row in result.mappings()]
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
    components = _expense_components(
        rows, reference_date, coverage, list(latest_loans.values()), plans, links
    )
    current = [row for row in rows if row["date"] >= month_start]
    observed_income = sum(row["amount"] for row in current if row["type"] == "수입")
    observed_expense = sum(-row["amount"] for row in current if row["type"] == "지출")
    remaining_income = sum(source.remaining_amount for source in sources)
    reasons = [
        reason for component in components for reason in component.missing_reasons
    ]
    if not sources:
        reasons.append(
            "정기 수입을 식별할 급여 이력이나 사용자 예상 설정이 없음; 기타 수입은 반복하지 않음"
        )
    if any(
        source.status in {"uncertain", "late", "partial", "stopped"}
        for source in sources
    ):
        reasons.append("확인이 필요한 급여 출처가 있음; 출처별 상태와 제외 사유 참고")
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
    projected_expense = (
        observed_expense + remaining_expense if remaining_expense is not None else None
    )
    return MonthlyProjection(
        period=_period(reference_date),
        as_of_date=reference_date,
        observed_through=coverage.last_observed_date,
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
        if reasons
        else "medium",
        included_periods=coverage.adequately_covered_periods,
        excluded_periods=coverage.excluded_periods,
        missing_reasons=sorted(set(reasons)),
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
