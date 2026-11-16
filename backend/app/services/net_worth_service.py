"""재무상태 (T061, plan 2.5 and 3.3): net worth reconciliation and emergency fund.

Reconciliation between two asset (net worth) snapshot dates S < E::

    순자산 변화 = 잔여 + 대출 잔액 감소분 + 투자 평가 변동 + 설명되지 않은 차이

- Interval boundary: a snapshot is a balance "as of" the end of its date, so
  it already reflects that day's transactions. The transactions that explain
  the change from S to E are those dated S+1 … E (start exclusive, end
  inclusive). Consecutive intervals therefore never count a day twice.
- 잔여 = income_total − total_outflow over that interval, a SQL aggregate over
  ``vw_metric_flow_lines`` with the monthly-flow formulas
  (``flow_summary_columns``). Nothing is re-summed in Python.
- 대출 잔액 감소분 = loans balance total at S − at E (``vw_snapshot_kind_totals``),
  read from the snapshots only; no interest/principal split.
- 투자 평가 변동 = (investments market value at E − at S) − net investment
  transfers of the interval, where net investment transfer in =
  −(signed sum of 이체 legs a human marked ``investment``).
- 설명되지 않은 차이 = the rest, left as its own item. It is never filled with
  estimated items.

Every snapshot kind keeps its own dates; kinds are never aligned silently.
"""

from collections.abc import Iterable
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import and_, func, not_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.validation import query_error
from app.models.insurance_contract import InsuranceContract
from app.models.user_profile_snapshot import UserProfileSnapshot
from app.schemas.metrics import MetricAsOf, MetricContract
from app.schemas.net_worth import (
    UNEXPLAINED_SHARE_NOT_COMPUTABLE,
    UNEXPLAINED_SHARE_ZERO_CHANGE,
    EmergencyFundBaseline,
    EmergencyFundResponse,
    NetWorthPoint,
    NetWorthReconciliationResponse,
    OtherKindAsOf,
    ReconciliationFlow,
    ReconciliationInterval,
    ReconciliationItems,
    SnapshotDatesByKind,
    SnapshotIntervalItem,
    SnapshotIntervalsResponse,
    SnapshotKindPair,
    TransactionCoverage,
    TransferBreakdown,
)
from app.services.comparison_service import (
    load_periods_with_data,
    median_won,
    period_end,
    period_of,
    period_range,
    period_start,
    shift_period,
)
from app.services.metric_views import (
    FLOW_LINES_VIEW,
    METRIC_CURRENCY,
    METRIC_TRANSACTIONS_VIEW,
    MONTHLY_FLOW_SUMMARY_VIEW,
    flow_summary_columns,
)
from app.services.metrics_service import build_flow_contract, load_as_of, ratio
from app.services.net_worth_views import (
    NET_WORTH_SNAPSHOTS_VIEW,
    SNAPSHOT_KIND_TOTALS_VIEW,
)
from app.services.settings_service import (
    DEFAULT_COMPARISON_BASELINE_MONTHS,
    baseline_start_period,
    get_comparison_settings,
)

RECONCILIATION_DEFINITION = "net_worth_reconciliation.v1"
EMERGENCY_FUND_DEFINITION = "emergency_fund.v1"

BOUNDARY_RULE = (
    "스냅샷은 그날 끝의 잔액으로 본다. 그래서 시작 스냅샷일의 거래는 이미 시작 잔액에 "
    "들어 있고, 구간의 거래는 시작 스냅샷 다음 날부터 끝 스냅샷일까지(시작 제외, 끝 포함)"
    "다. 이어지는 구간이 같은 날을 두 번 세지 않는다. 스냅샷을 찍은 시각 뒤에 기록된 "
    "같은 날 거래는 설명되지 않은 차이에 남는다."
)
COVERAGE_RULE = (
    "가장 이른 유효 거래일이 구간 첫날 이전이거나 같고, 거래 기준일이 끝 스냅샷일 이후"
    "이거나 같고, 구간에 걸친 달마다 유효 KRW 거래가 하나 이상 있어야 덮었다고 본다."
)
NETTING_RULE = (
    "이체는 원래 부호대로 더한다(받음 +, 보냄 −). 장부 안의 두 계좌 사이 이동은 두 "
    "다리(−X, +X)가 모두 internal_move로 표시되어 그 줄 안에서 0으로 상쇄되므로 두 번 "
    "세지 않는다. investment/savings는 장부 쪽 계좌에서 투자 보유분·저축 예금으로 "
    "나가거나 들어오는 다리에 표시한다. 상대 다리도 장부에 있으면 그 쌍은 장부 안의 "
    "이동이므로 internal_move로 표시한다. 순투자 유입 = −investment_net."
)
INTERVAL_RULE = (
    "구간은 자산(순자산) 스냅샷 날짜 두 개로 정한다. 대출·투자 스냅샷이 두 날짜 모두에 "
    "있으면 observed, 그 종류의 스냅샷이 한 번도 없으면 absent(양 끝 0), 그 밖에는 "
    "mismatched로 두고 맞추지 않는다."
)
KIND_VALUE_BASIS = {
    "loans": "loans.balance 합계 (스냅샷 종류 loans, 숨김 여부와 무관한 전체 행)",
    "investments": "investments.market_value 합계 (스냅샷 종류 investments)",
}
CASH_LIKE_BASIS = (
    "자산 스냅샷의 현금성 자산 = vw_asset_snapshot_canonical.cash_equivalent_total과 같은 "
    "규칙: 사람이 지정한 is_cash_equivalent·liquidity_tier가 먼저, 둘 다 없으면 기존 이름 "
    "규칙. 이름 규칙으로만 판단한 금액은 cash_like_name_rule_total로 따로 보인다."
)
LEGACY_EMERGENCY_FUND = (
    "/api/v1/analytics/liquidity-health의 emergency_fund_months는 legacy다. 분모가 "
    "마감월 필수 지출 + 대출 상환이고 미정 비중을 싣지 않는다. 바뀌지 않았다."
)


def _won(value: object) -> int:
    if value is None:
        return 0
    return int(Decimal(str(value)).quantize(Decimal(1), rounding=ROUND_HALF_UP))


def _as_date(value: object) -> date:
    return value if isinstance(value, date) else date.fromisoformat(str(value))


def _latest_on_or_before(dates: Iterable[date], limit: date) -> date | None:
    candidates = [value for value in dates if value <= limit]
    return max(candidates) if candidates else None


@dataclass(slots=True)
class _SnapshotContext:
    net_worth: dict[date, dict]
    kind_totals: dict[str, dict[date, dict]]
    insurance_dates: list[date]
    profile_dates: list[date]
    as_of: MetricAsOf
    periods_with_data: frozenset[str]

    @property
    def asset_dates(self) -> list[date]:
        return sorted(self.net_worth)


async def _load_context(db_session: AsyncSession) -> _SnapshotContext:
    net_worth = {
        _as_date(row["snapshot_date"]): dict(row)
        for row in (
            await db_session.execute(select(NET_WORTH_SNAPSHOTS_VIEW))
        ).mappings()
    }
    kind_totals: dict[str, dict[date, dict]] = {"loans": {}, "investments": {}}
    for row in (await db_session.execute(select(SNAPSHOT_KIND_TOTALS_VIEW))).mappings():
        kind_totals[row["kind"]][_as_date(row["snapshot_date"])] = dict(row)

    async def dates(column) -> list[date]:  # type: ignore[no-untyped-def]
        return sorted(
            _as_date(value)
            for value in await db_session.scalars(select(column).distinct())
        )

    return _SnapshotContext(
        net_worth=net_worth,
        kind_totals=kind_totals,
        insurance_dates=await dates(InsuranceContract.snapshot_date),
        profile_dates=await dates(UserProfileSnapshot.snapshot_date),
        as_of=await load_as_of(db_session),
        periods_with_data=await load_periods_with_data(db_session),
    )


def _net_worth_point(row: dict, snapshot_date: date) -> NetWorthPoint:
    return NetWorthPoint(
        snapshot_date=snapshot_date,
        asset_total=_won(row["asset_total"]),
        liability_total=_won(row["liability_total"]),
        # Each total is rounded to the won first, so the identity is exact on
        # the returned numbers.
        net_worth=_won(row["asset_total"]) - _won(row["liability_total"]),
        negative_asset_excluded_total=_won(row["negative_asset_excluded_total"]),
    )


def _kind_pair(
    context: _SnapshotContext, kind: str, start: date, end: date
) -> SnapshotKindPair:
    totals = context.kind_totals[kind]
    if not totals:
        return SnapshotKindPair(
            kind=kind,  # type: ignore[arg-type]
            pair_status="absent",
            start_as_of=None,
            end_as_of=None,
            start_value=0,
            end_value=0,
            change=0,
            missing_value_row_count=0,
            value_basis=KIND_VALUE_BASIS[kind],
        )
    start_as_of = _latest_on_or_before(totals, start)
    end_as_of = _latest_on_or_before(totals, end)
    start_value = _won(totals[start_as_of]["value_total"]) if start_as_of else None
    end_value = _won(totals[end_as_of]["value_total"]) if end_as_of else None
    observed = start_as_of == start and end_as_of == end
    missing = sum(
        int(totals[value]["missing_value_row_count"])
        for value in {start_as_of, end_as_of}
        if value is not None
    )
    return SnapshotKindPair(
        kind=kind,  # type: ignore[arg-type]
        pair_status="observed" if observed else "mismatched",
        start_as_of=start_as_of,
        end_as_of=end_as_of,
        start_value=start_value,
        end_value=end_value,
        change=(end_value - start_value)  # type: ignore[operator]
        if observed
        else None,
        missing_value_row_count=missing,
        value_basis=KIND_VALUE_BASIS[kind],
    )


async def _interval_flow(
    db_session: AsyncSession, start: date, end: date
) -> dict[str, int]:
    lines = FLOW_LINES_VIEW
    row = (
        (
            await db_session.execute(
                select(*flow_summary_columns(lines)).where(
                    lines.c.date > start, lines.c.date <= end
                )
            )
        )
        .mappings()
        .one()
    )
    return {key: int(value or 0) for key, value in row.items()}


async def _non_krw_count(db_session: AsyncSession, start: date, end: date) -> int:
    tx = METRIC_TRANSACTIONS_VIEW
    value = await db_session.scalar(
        select(func.count()).where(
            and_(
                tx.c.date > start,
                tx.c.date <= end,
                not_(func.upper(tx.c.currency) == METRIC_CURRENCY),
            )
        )
    )
    return int(value or 0)


@dataclass(slots=True)
class _Reconciliation:
    status: str
    reasons: list[str]
    interval: ReconciliationInterval
    start: NetWorthPoint
    end: NetWorthPoint
    kinds: list[SnapshotKindPair]
    other: OtherKindAsOf
    coverage: TransactionCoverage
    flow: ReconciliationFlow
    transfers: TransferBreakdown
    items: ReconciliationItems


async def _reconcile(
    db_session: AsyncSession, context: _SnapshotContext, start: date, end: date
) -> _Reconciliation:
    first_day = start + timedelta(days=1)
    start_point = _net_worth_point(context.net_worth[start], start)
    end_point = _net_worth_point(context.net_worth[end], end)
    kinds = [_kind_pair(context, kind, start, end) for kind in ("loans", "investments")]
    other = OtherKindAsOf(
        insurance_start_as_of=_latest_on_or_before(context.insurance_dates, start),
        insurance_end_as_of=_latest_on_or_before(context.insurance_dates, end),
        profile_start_as_of=_latest_on_or_before(context.profile_dates, start),
        profile_end_as_of=_latest_on_or_before(context.profile_dates, end),
    )

    as_of = context.as_of
    gaps = [
        period
        for period in period_range(period_of(first_day), period_of(end))
        if period not in context.periods_with_data
    ]
    covered = (
        as_of.first_transaction_date is not None
        and as_of.transaction_as_of is not None
        and as_of.first_transaction_date <= first_day
        and as_of.transaction_as_of >= end
        and not gaps
    )
    coverage = TransactionCoverage(
        covered=covered,
        first_transaction_date=as_of.first_transaction_date,
        transaction_as_of=as_of.transaction_as_of,
        periods_without_data=gaps,
        non_krw_transaction_count=await _non_krw_count(db_session, start, end),
        rule=COVERAGE_RULE,
    )

    totals = await _interval_flow(db_session, start, end)
    flow = ReconciliationFlow(
        income_total=totals["income_total"],
        total_outflow=totals["total_outflow"],
        committed_loan_total=totals["committed_loan_total"],
        residual=totals["residual"],
        adjustability_undecided_total=totals["adjustability_undecided_total"],
        transaction_count=totals["transaction_count"],
    )
    transfers = TransferBreakdown(
        transfer_net=totals["transfer_net"],
        investment_net=totals["transfer_investment_net"],
        savings_net=totals["transfer_savings_net"],
        investment_savings_net=totals["transfer_investment_savings_net"],
        internal_move_net=totals["transfer_internal_move_net"],
        undecided_net=totals["transfer_undecided_net"],
        activity_total=totals["transfer_activity_total"],
        undecided_activity_total=totals["transfer_undecided_activity_total"],
        undecided_share=ratio(
            totals["transfer_undecided_activity_total"],
            totals["transfer_activity_total"],
        ),
        netting_rule=NETTING_RULE,
    )

    loans, investments = kinds
    loan_decrease = (
        loans.start_value - loans.end_value  # type: ignore[operator]
        if loans.change is not None
        else None
    )
    net_transfer_in = -transfers.investment_net
    valuation = (
        investments.change - net_transfer_in if investments.change is not None else None
    )
    net_worth_change = end_point.net_worth - start_point.net_worth

    reasons: list[str] = []
    mismatched = [kind.kind for kind in kinds if kind.pair_status == "mismatched"]
    for kind in kinds:
        if kind.pair_status == "mismatched":
            reasons.append(
                f"{kind.kind} 스냅샷 날짜가 구간과 다르다: 시작 {start} 기준 "
                f"{kind.start_as_of}, 끝 {end} 기준 {kind.end_as_of}. 맞추지 않았다."
            )
        elif kind.pair_status == "absent":
            reasons.append(f"{kind.kind} 스냅샷이 한 번도 없어 양 끝을 0으로 두었다.")
        if kind.missing_value_row_count:
            reasons.append(
                f"{kind.kind} 행 {kind.missing_value_row_count}개는 값이 비어 0으로 셌다."
            )
    if not covered:
        reasons.append(
            "거래 기록이 구간을 덮지 않는다"
            + (f" (자료 없는 달: {', '.join(gaps)})" if gaps else "")
            + "."
        )
    if transfers.undecided_activity_total:
        reasons.append(
            "목적이 정해지지 않은 이체가 있어 투자 평가 변동이 불완전하다 "
            f"(이체 금액 기준 미정 비중 {transfers.undecided_share})."
        )
    if coverage.non_krw_transaction_count:
        reasons.append(
            f"원화 외 거래 {coverage.non_krw_transaction_count}건은 합산하지 않았다."
        )

    if mismatched:
        state = "snapshot_dates_mismatched"
    elif not covered:
        state = "transactions_not_covered"
    elif transfers.undecided_activity_total:
        state = "incomplete_classification"
    else:
        state = "complete"
    computable = state in ("complete", "incomplete_classification")
    unexplained = (
        net_worth_change - flow.residual - loan_decrease - valuation  # type: ignore[operator]
        if computable
        else None
    )
    if unexplained is None:
        unexplained_share, withheld = None, UNEXPLAINED_SHARE_NOT_COMPUTABLE
    elif net_worth_change == 0:
        unexplained_share, withheld = None, UNEXPLAINED_SHARE_ZERO_CHANGE
    else:
        unexplained_share = round(unexplained / abs(net_worth_change), 4)
        withheld = None
    provisional = bool(transfers.undecided_activity_total)
    items = ReconciliationItems(
        net_worth_change=net_worth_change,
        residual=flow.residual,
        loan_balance_decrease=loan_decrease,
        investment_valuation_change=valuation,
        unexplained_difference=unexplained,
        investment_value_change=investments.change,
        investment_net_transfer_in=net_transfer_in,
        unexplained_share_of_change=unexplained_share,
        unexplained_share_withheld_reason=withheld,  # type: ignore[arg-type]
        investment_valuation_change_provisional=provisional,
        investment_valuation_change_provisional_reason=(
            "구간에 목적 미정 이체가 있다(이체 |금액| "
            f"{transfers.undecided_activity_total}원). 그중 투자 입금이 있으면 순투자 "
            "유입과 투자 평가 변동이 달라진다. 사람이 목적을 정하기 전까지 잠정값이다."
            if provisional
            else None
        ),
    )
    return _Reconciliation(
        status=state,
        reasons=reasons,
        interval=ReconciliationInterval(
            start_snapshot_date=start,
            end_snapshot_date=end,
            transaction_start_date=first_day,
            transaction_end_date=end,
            boundary_rule=BOUNDARY_RULE,
        ),
        start=start_point,
        end=end_point,
        kinds=kinds,
        other=other,
        coverage=coverage,
        flow=flow,
        transfers=transfers,
        items=items,
    )


RECONCILIATION_FIELD_SCOPES = {
    "items.net_worth_change": "끝 순자산 − 시작 순자산 (자산 스냅샷: 음수 자산 행 제외 자산 − 부채)",
    "items.residual": "잔여 = 수입 − 총지급, 구간(시작 다음 날 … 끝 날)의 vw_metric_flow_lines",
    "items.loan_balance_decrease": "시작 대출 잔액 − 끝 대출 잔액 (스냅샷, 이자·원금 추정 분리 없음)",
    "items.investment_valuation_change": "투자 평가액 변화 − 순투자 유입(−investment_net)",
    "items.unexplained_difference": "나머지. 추정 항목으로 채우지 않는다",
    "items.unexplained_share_of_change": (
        "설명되지 않은 차이 ÷ |순자산 변화|. 부호 있음, 절댓값이 1을 넘을 수 있음. "
        "변화가 0이거나 차이를 계산할 수 없으면 null"
    ),
    "items.investment_valuation_change_provisional": (
        "목적 미정 이체가 있으면 true: 투자 입금일 수 있어 투자 평가 변동이 잠정값"
    ),
    "status": (
        "complete는 대조 항목을 모두 계산할 수 있었다는 뜻이지 변화가 설명되었다는 "
        "뜻이 아니다"
    ),
    "transfers.undecided_share": "목적 미정 이체 |금액| ÷ 전체 이체 |금액|",
}


async def get_net_worth_reconciliation(
    db_session: AsyncSession,
    *,
    start_date: date | None,
    end_date: date | None,
) -> NetWorthReconciliationResponse:
    context = await _load_context(db_session)
    asset_dates = context.asset_dates
    if (start_date is None) != (end_date is None):
        missing_param = "end_date" if end_date is None else "start_date"
        raise query_error(
            missing_param, "start_date와 end_date는 함께 주거나 함께 생략한다."
        )
    if start_date is not None and end_date is not None:
        missing = [
            value for value in (start_date, end_date) if value not in context.net_worth
        ]
        if missing:
            raise query_error(
                "start_date" if start_date in missing else "end_date",
                "자산 스냅샷이 없는 날짜다: "
                + ", ".join(value.isoformat() for value in missing)
                + ". /metrics/net-worth/intervals에서 날짜를 고른다.",
                value=missing[0].isoformat(),
            )
        if start_date >= end_date:
            raise query_error(
                "start_date",
                "start_date는 end_date보다 앞서야 한다.",
                value=start_date.isoformat(),
            )
    elif len(asset_dates) >= 2:
        start_date, end_date = asset_dates[-2], asset_dates[-1]

    if start_date is None or end_date is None:
        contract = await build_flow_contract(
            db_session,
            definition=RECONCILIATION_DEFINITION,
            scope="순자산 대조: 자산 스냅샷 두 개가 없어 계산하지 않았다.",
            start_date=None,
            end_date=None,
            include_undecided=False,
        )
        return NetWorthReconciliationResponse(
            status="no_snapshot_pair",
            status_reasons=[
                f"자산(순자산) 스냅샷 날짜가 {len(asset_dates)}개뿐이라 구간을 만들 수 없다."
            ],
            interval=None,
            net_worth_start=None,
            net_worth_end=None,
            kinds=[],
            other_kinds=None,
            transactions=None,
            flow=None,
            transfers=None,
            items=None,
            contract=contract,
        )

    result = await _reconcile(db_session, context, start_date, end_date)
    contract = await build_flow_contract(
        db_session,
        definition=RECONCILIATION_DEFINITION,
        scope=(
            "순자산 대조: 두 자산 스냅샷 사이의 순자산 변화를 같은 구간의 거래 기록(잔여)과 "
            "대출·투자 스냅샷 차이로 설명하고 나머지를 설명되지 않은 차이로 남긴다"
        ),
        start_date=result.interval.transaction_start_date,
        end_date=result.interval.transaction_end_date,
        field_scopes=RECONCILIATION_FIELD_SCOPES,
    )
    return NetWorthReconciliationResponse(
        status=result.status,  # type: ignore[arg-type]
        status_reasons=result.reasons,
        interval=result.interval,
        net_worth_start=result.start,
        net_worth_end=result.end,
        kinds=result.kinds,
        other_kinds=result.other,
        transactions=result.coverage,
        flow=result.flow,
        transfers=result.transfers,
        items=result.items,
        contract=contract,
    )


async def list_snapshot_intervals(
    db_session: AsyncSession, *, limit: int
) -> SnapshotIntervalsResponse:
    context = await _load_context(db_session)
    asset_dates = context.asset_dates
    pairs = list(zip(asset_dates, asset_dates[1:], strict=False))[::-1][:limit]
    intervals = []
    for start, end in pairs:
        result = await _reconcile(db_session, context, start, end)
        intervals.append(
            SnapshotIntervalItem(
                start_snapshot_date=start,
                end_snapshot_date=end,
                status=result.status,  # type: ignore[arg-type]
                net_worth_change=result.items.net_worth_change,
                unexplained_difference=result.items.unexplained_difference,
                transfer_undecided_share=result.transfers.undecided_share,
                unexplained_share_of_change=result.items.unexplained_share_of_change,
                investment_valuation_change_provisional=(
                    result.items.investment_valuation_change_provisional
                ),
            )
        )

    def newest_first(values: Iterable[date]) -> list[date]:
        return sorted(values, reverse=True)

    return SnapshotIntervalsResponse(
        snapshot_dates=SnapshotDatesByKind(
            assets=newest_first(asset_dates),
            loans=newest_first(context.kind_totals["loans"]),
            investments=newest_first(context.kind_totals["investments"]),
            insurance=newest_first(context.insurance_dates),
            profile=newest_first(context.profile_dates),
        ),
        intervals=intervals,
        interval_rule=INTERVAL_RULE,
    )


# --------------------------------------------------------------------------
# Emergency fund months (plan 3.3: moved to 재무상태 with an explicit formula).
# --------------------------------------------------------------------------


async def _recent_closed_baseline(
    db_session: AsyncSession, as_of: MetricAsOf
) -> EmergencyFundBaseline:
    """The comparison contract's baseline months, ending at the last closed month.

    Same walk as ``resolve_comparison_window`` (skip months without data, stop
    at the data start or before the baseline start date), but the last closed
    month itself is included: here nothing is compared against it.
    """
    settings = await get_comparison_settings(db_session)
    start_period = baseline_start_period(settings.baseline_start_date)
    requested = DEFAULT_COMPARISON_BASELINE_MONTHS
    last_closed = as_of.last_closed_period
    periods: list[str] = []
    skipped: list[str] = []
    limited_by: str | None = None
    if as_of.first_transaction_date is not None and last_closed is not None:
        first_period = period_of(as_of.first_transaction_date)
        with_data = await load_periods_with_data(db_session)
        candidate = last_closed
        while len(periods) < requested:
            if candidate < first_period:
                limited_by = "data_start"
                break
            if start_period is not None and candidate < start_period:
                limited_by = "baseline_start_date"
                break
            (periods if candidate in with_data else skipped).append(candidate)
            candidate = shift_period(candidate, -1)
    else:
        limited_by = "data_start"
    count = len(periods)
    return EmergencyFundBaseline(
        months_requested=requested,
        periods=sorted(periods),
        month_count=count,
        status="none"
        if count == 0
        else "full"
        if count >= requested
        else "fewer_than_requested",
        limited_by=limited_by if count < requested else None,  # type: ignore[arg-type]
        baseline_start_date=settings.baseline_start_date,
        skipped_periods=sorted(skipped),
        last_closed_period=last_closed,
    )


async def get_emergency_fund(db_session: AsyncSession) -> EmergencyFundResponse:
    as_of = await load_as_of(db_session)
    snapshot = NET_WORTH_SNAPSHOTS_VIEW
    latest = (
        (
            await db_session.execute(
                select(snapshot).order_by(snapshot.c.snapshot_date.desc()).limit(1)
            )
        )
        .mappings()
        .one_or_none()
    )
    baseline = await _recent_closed_baseline(db_session, as_of)
    summary = MONTHLY_FLOW_SUMMARY_VIEW
    months = []
    if baseline.periods:
        months = [
            dict(row)
            for row in (
                await db_session.execute(
                    select(
                        summary.c.period,
                        summary.c.protected_spend,
                        summary.c.adjustability_undecided_total,
                        summary.c.total_outflow,
                    ).where(summary.c.period.in_(baseline.periods))
                )
            ).mappings()
        ]
    protected = median_won([int(row["protected_spend"]) for row in months])
    undecided = median_won(
        [int(row["adjustability_undecided_total"]) for row in months]
    )
    undecided_share = ratio(
        sum(int(row["adjustability_undecided_total"]) for row in months),
        sum(int(row["total_outflow"]) for row in months),
    )
    cash = _won(latest["cash_like_total"]) if latest is not None else None
    name_rule = (
        _won(latest["cash_like_name_rule_total"]) if latest is not None else None
    )
    fund_months = (
        round(cash / protected, 2)
        if cash is not None and protected is not None and protected > 0
        else None
    )

    reasons: list[str] = []
    if latest is None:
        state = "no_asset_snapshot"
        reasons.append("자산 스냅샷이 없다.")
    elif protected is None or protected <= 0:
        state = "no_baseline"
        reasons.append(
            "기준 마감월이 없거나 월 보호 지급이 0 이하라 개월 수를 내지 않았다."
        )
    elif undecided_share:
        state = "incomplete_classification"
        reasons.append(
            "조정 가능성 미정 지출이 있어 월 보호 지급이 실제보다 작을 수 있다 "
            f"(기준 기간 미정 비중 {undecided_share}). 미정을 보호로 추정하지 않았다."
        )
    else:
        state = "complete"
    if name_rule:
        reasons.append(
            "현금성 자산 일부는 사람이 지정한 유동성 정보 없이 기존 이름 규칙으로 판단했다."
        )
    if latest is not None and as_of.transaction_as_of is not None:
        reasons.append(
            f"자산 스냅샷 기준일 {_as_date(latest['snapshot_date'])}과 거래 기준일 "
            f"{as_of.transaction_as_of}은 따로 표시한다."
        )

    contract: MetricContract = await build_flow_contract(
        db_session,
        definition=EMERGENCY_FUND_DEFINITION,
        scope=(
            "비상금 개월 수 = 최신 자산 스냅샷의 현금성 자산 ÷ 최근 마감월(최대 6개) 보호 "
            "지급의 중앙값. 보호 지급 = 조정 가능성 protected 지출(대출·할부 포함)"
        ),
        start_date=period_start(baseline.periods[0]) if baseline.periods else None,
        end_date=period_end(baseline.periods[-1]) if baseline.periods else None,
        include_undecided=bool(baseline.periods),
        field_scopes={
            "monthly_protected_outflow": "기준 마감월 protected_spend의 중앙값 (vw_monthly_flow_summary)",
            "cash_like_total": "최신 자산 스냅샷 현금성 자산 (vw_net_worth_snapshots)",
            "emergency_fund_months": "cash_like_total ÷ monthly_protected_outflow, 소수 둘째 자리",
        },
    )
    return EmergencyFundResponse(
        status=state,  # type: ignore[arg-type]
        status_reasons=reasons,
        asset_snapshot_date=_as_date(latest["snapshot_date"])
        if latest is not None
        else None,
        cash_like_total=cash,
        cash_like_name_rule_total=name_rule,
        cash_like_basis=CASH_LIKE_BASIS,
        monthly_protected_outflow=protected,
        monthly_adjustability_undecided_outflow=undecided,
        adjustability_undecided_share=undecided_share,
        emergency_fund_months=fund_months,
        baseline=baseline,
        legacy_surface=LEGACY_EMERGENCY_FUND,
        contract=contract,
    )
