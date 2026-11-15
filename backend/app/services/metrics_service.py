"""Read side of the metric view layer (T054).

Every aggregate here is a SQL aggregate over ``vw_metric_flow_lines`` or the
monthly views built on it. Python only shapes rows and derives ratios from the
SQL totals; it never re-sums transaction amounts.
"""

from collections import defaultdict
from datetime import date

from fastapi import HTTPException, status
from sqlalchemy import and_, case, func, select, true
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.elements import ColumnElement

from app.schemas.metrics import (
    ExcludedCurrencyItem,
    MetricAsOf,
    MetricContract,
    MetricDataStatusResponse,
    MetricInclusion,
    MonthlyFlowMonth,
    MonthlyFlowResponse,
    MonthlyFlowRow,
    SnapshotAsOf,
    SpendCubeResponse,
    SpendCubeRow,
    TransferFlowRow,
)
from app.services.metric_views import (
    AS_OF_VIEW,
    EXCLUDED_CURRENCY_VIEW,
    EXPENSE,
    FLOW_DEFINITION,
    FLOW_LINES_VIEW,
    MONTHLY_FLOW_SUMMARY_VIEW,
    MONTHLY_FLOW_VIEW,
    SPEND_CUBE_DEFINITION,
    SPEND_CUBE_DIMENSIONS,
    SPEND_CUBE_VIEW,
)

FLOW_LINES_BASIS = "vw_metric_flow_lines"
PURCHASE_NET_DEFINITION = "purchase_net.v1"

SIGN_CONVENTION = (
    "income_total·transfer_net are received-positive; spend totals "
    "(total_outflow, committed_*, ad_hoc_*, undecided_total) are paid-positive "
    "and refunds reduce them; signed_amount/signed_total keep the source sign "
    "(수입 +, 지출 −, 환불 +)."
)
REFUND_RULE = (
    "Refunds (positive 지출) stay in the month they were posted and net against "
    "spend there. A confirmed settlement allocation only moves the classification "
    "(category, merchant, payment form, adjustability) of the allocated part to "
    "the original purchase; the unallocated remainder keeps the refund's own "
    "classification. Closed months never change when a later refund is linked."
)
TRANSFER_RULE = (
    "이체 is excluded from income and spend; it appears only as transfer_net "
    "(signed) and transfer_activity_total (gross). T061: transfer_net is split "
    "by the human-set purpose (investment, savings, internal_move, undecided); "
    "legs are summed with their sign, so both legs of a move between ledger "
    "accounts net out inside internal_move."
)
LOAN_RULE = (
    "Loan-linked 지출 is committed_loan (full 원리금, no principal/interest split) "
    "and is included in total_outflow; living_spend = total_outflow − "
    "committed_loan_total."
)
PERIOD_RULE = (
    "Each line is attributed to the calendar month (YYYY-MM) of its posting date."
)


def flow_inclusion(basis_view: str = FLOW_LINES_BASIS) -> MetricInclusion:
    return MetricInclusion(
        basis_view=basis_view,
        sign_convention=SIGN_CONVENTION,
        refunds=REFUND_RULE,
        transfers=TRANSFER_RULE,
        loans=LOAN_RULE,
        period_attribution=PERIOD_RULE,
    )


def purchase_net_inclusion() -> MetricInclusion:
    return MetricInclusion(
        basis_view="vw_metric_transactions.purchase_net_amount",
        sign_convention="purchase_net_amount keeps the source sign.",
        refunds=(
            "Confirmed settlement allocations net into the original purchase "
            "regardless of the refund's posting date (purchase economics, not "
            "cashflow); an unallocated refund remainder stays on the refund row."
        ),
        transfers=TRANSFER_RULE,
        loans="Loan-linked rows are excluded by the consuming detector where stated.",
        period_attribution="Purchase rows keep their own posting date.",
    )


async def load_as_of(db_session: AsyncSession) -> MetricAsOf:
    row = (await db_session.execute(select(AS_OF_VIEW))).mappings().one_or_none()
    if row is None:
        return MetricAsOf()
    return MetricAsOf(
        transaction_as_of=_as_date(row["transaction_as_of"]),
        first_transaction_date=_as_date(row["first_transaction_date"]),
        last_closed_period=row["last_closed_period"],
        in_progress_period=row["in_progress_period"],
        snapshot_as_of=SnapshotAsOf(
            assets=_as_date(row["asset_snapshot_as_of"]),
            loans=_as_date(row["loan_snapshot_as_of"]),
            investments=_as_date(row["investment_snapshot_as_of"]),
            insurance=_as_date(row["insurance_snapshot_as_of"]),
            profile=_as_date(row["profile_snapshot_as_of"]),
        ),
    )


async def load_non_krw_count(db_session: AsyncSession) -> int:
    value = await db_session.scalar(select(AS_OF_VIEW.c.non_krw_transaction_count))
    return int(value or 0)


def month_status(period: str, as_of: MetricAsOf) -> str:
    if as_of.last_closed_period is not None and period <= as_of.last_closed_period:
        return "closed"
    return "in_progress"


def ratio(numerator: int, denominator: int) -> float | None:
    if denominator <= 0:
        return None
    return round(numerator / denominator, 4)


def line_date_filters(
    *, start_date: date | None, end_date: date | None
) -> list[ColumnElement[bool]]:
    lines = FLOW_LINES_VIEW
    filters: list[ColumnElement[bool]] = []
    if start_date is not None:
        filters.append(lines.c.date >= start_date)
    if end_date is not None:
        filters.append(lines.c.date <= end_date)
    return filters


async def load_undecided_totals(
    db_session: AsyncSession,
    *,
    start_date: date | None,
    end_date: date | None,
    extra_filters: list[ColumnElement[bool]] | None = None,
) -> tuple[int, int]:
    """(adjustability_undecided_total, total_outflow) for spend in scope."""
    lines = FLOW_LINES_VIEW
    filters = [
        lines.c.type == EXPENSE,
        *line_date_filters(start_date=start_date, end_date=end_date),
        *(extra_filters or []),
    ]
    row = (
        await db_session.execute(
            select(
                func.coalesce(
                    func.sum(
                        case(
                            (lines.c.adjustability == "undecided", -lines.c.amount),
                            else_=0,
                        )
                    ),
                    0,
                ).label("undecided"),
                func.coalesce(func.sum(-lines.c.amount), 0).label("outflow"),
            ).where(and_(*filters))
        )
    ).one()
    return int(row.undecided or 0), int(row.outflow or 0)


async def build_flow_contract(
    db_session: AsyncSession,
    *,
    definition: str,
    scope: str,
    start_date: date | None,
    end_date: date | None,
    field_scopes: dict[str, str] | None = None,
    include_undecided: bool = True,
) -> MetricContract:
    as_of = await load_as_of(db_session)
    undecided_total: int | None = None
    share: float | None = None
    if include_undecided:
        undecided_total, outflow = await load_undecided_totals(
            db_session, start_date=start_date, end_date=end_date
        )
        share = ratio(undecided_total, outflow)
    return MetricContract(
        definition=definition,
        scope=scope,
        inclusion=flow_inclusion(),
        as_of=as_of,
        adjustability_undecided_total=undecided_total,
        adjustability_undecided_share=share,
        non_krw_transaction_count=await load_non_krw_count(db_session),
        field_scopes=field_scopes or {},
    )


async def build_purchase_net_contract(
    db_session: AsyncSession, *, definition: str, scope: str
) -> MetricContract:
    return MetricContract(
        definition=definition,
        scope=scope,
        inclusion=purchase_net_inclusion(),
        as_of=await load_as_of(db_session),
        non_krw_transaction_count=await load_non_krw_count(db_session),
    )


async def get_monthly_flow(
    db_session: AsyncSession,
    *,
    start_period: str | None,
    end_period: str | None,
) -> MonthlyFlowResponse:
    summary = MONTHLY_FLOW_SUMMARY_VIEW
    query = select(summary).order_by(summary.c.period.asc())
    flow = MONTHLY_FLOW_VIEW
    rows_query = select(flow).order_by(flow.c.period.asc(), flow.c.flow_row.asc())
    if start_period is not None:
        query = query.where(summary.c.period >= start_period)
        rows_query = rows_query.where(flow.c.period >= start_period)
    if end_period is not None:
        query = query.where(summary.c.period <= end_period)
        rows_query = rows_query.where(flow.c.period <= end_period)
    rows_by_period: dict[str, list[MonthlyFlowRow]] = defaultdict(list)
    for row in (await db_session.execute(rows_query)).mappings():
        rows_by_period[row["period"]].append(
            MonthlyFlowRow(
                section=row["flow_section"],
                row=row["flow_row"],
                amount=int(row["amount"]),
                signed_amount=int(row["signed_amount"]),
                transaction_count=int(row["transaction_count"]),
            )
        )
    items = []
    for row in (await db_session.execute(query)).mappings():
        values = {key: int(row[key]) for key in _MONTH_INT_FIELDS}
        is_closed = row["month_status"] == "closed"
        items.append(
            MonthlyFlowMonth(
                period=row["period"],
                month_status=row["month_status"],
                **values,
                adjustability_undecided_share=ratio(
                    values["adjustability_undecided_total"], values["total_outflow"]
                ),
                residual_rate=(
                    ratio(values["residual"], values["income_total"])
                    if is_closed
                    else None
                ),
                rows=rows_by_period[row["period"]],
                transfer_undecided_share=ratio(
                    values["transfer_undecided_activity_total"],
                    values["transfer_activity_total"],
                ),
                transfer_rows=transfer_rows(values),
            )
        )
    start_date = _period_start(start_period) if start_period else None
    end_date = _period_end(end_period) if end_period else None
    contract = await build_flow_contract(
        db_session,
        definition=FLOW_DEFINITION,
        scope=(
            "월 흐름표: 유효 거래(삭제·병합·대체 제외, KRW) 전체를 수입 / 약정 지급 / "
            "수시 지출 / 미정 / 이체 줄에 정확히 한 번씩 배정한 월별 합계"
        ),
        start_date=start_date,
        end_date=end_date,
        field_scopes=FLOW_FIELD_SCOPES,
    )
    return MonthlyFlowResponse(contract=contract, items=items)


FLOW_FIELD_SCOPES = {
    "income_total": "수입. 정기/비정기/이자·소액 구분 근거가 아직 없어 income_undetermined 한 줄",
    "total_outflow": "총지급 = 약정 지급 + 수시 지출 + 미정 (환불 차감, 대출 포함)",
    "living_spend": "생활 지출 = total_outflow − committed_loan_total (대출 제외)",
    "committed_total": (
        "약정 지급 = 대출 연결 + 할부 연결 + 사람이 등록한 정기 지급 묶음"
        "(recurring_commitments)에 속한 지출 (T056, vw_transaction_nature)"
    ),
    "undecided_total": (
        "미정 = 조정 가능성이 정해지지 않은 수시 지출. 조정 가능성 우선순위: "
        "거래 > 약정 > 카테고리 기본값, 대출·할부는 보호 고정 (T056)"
    ),
    "adjustable_spend": "조정 가능 지출 = 조정 가능성 adjustable 지출 합 (수시 + 약정)",
    "residual": "잔여 = income_total − total_outflow",
    "residual_rate": "현금 잔여율 = residual ÷ income_total, 마감월만",
    "transfer_net": "잔여의 행방: 이체 순액 전체 (목적별 나눔은 transfer_rows)",
    "transfer_rows": (
        "잔여의 행방 (T061): 투자·저축 이체 / 그 밖의 계좌 간 이동 / 목적 미정 이체. "
        "목적은 사람이 정한다(거래 > 거래처 규칙 > 카테고리 규칙). 합 = transfer_net"
    ),
}


def transfer_rows(values: dict[str, int]) -> list[TransferFlowRow]:
    """T061 잔여의 행방 rows from the summary columns (no re-aggregation)."""
    return [
        TransferFlowRow(
            row="transfer_investment_savings",
            label="투자·저축 이체",
            signed_amount=values["transfer_investment_savings_net"],
        ),
        TransferFlowRow(
            row="transfer_internal_move",
            label="그 밖의 계좌 간 이동",
            signed_amount=values["transfer_internal_move_net"],
        ),
        TransferFlowRow(
            row="transfer_undecided",
            label="목적 미정 이체",
            signed_amount=values["transfer_undecided_net"],
        ),
    ]


_MONTH_INT_FIELDS = (
    "income_total",
    "committed_loan_total",
    "committed_installment_total",
    "committed_recurring_total",
    "committed_total",
    "ad_hoc_protected_total",
    "ad_hoc_adjustable_total",
    "undecided_total",
    "total_outflow",
    "living_spend",
    "adjustable_spend",
    "protected_spend",
    "adjustability_undecided_total",
    "residual",
    "transfer_net",
    "transfer_activity_total",
    "other_type_total",
    "refund_total",
    "signed_total",
    "transaction_count",
    "transfer_investment_net",
    "transfer_savings_net",
    "transfer_investment_savings_net",
    "transfer_internal_move_net",
    "transfer_undecided_net",
    "transfer_undecided_activity_total",
)


async def get_spend_cube(
    db_session: AsyncSession,
    *,
    start_period: str | None,
    end_period: str | None,
    group_by: list[str],
    filters: dict[str, str],
    limit: int,
) -> SpendCubeResponse:
    cube = SPEND_CUBE_VIEW
    unknown = [name for name in group_by if name not in SPEND_CUBE_DIMENSIONS]
    if unknown:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"Unknown spend cube dimension: {', '.join(unknown)}",
        )
    dimensions = [cube.c[name] for name in dict.fromkeys(group_by)]
    conditions: list[ColumnElement[bool]] = []
    if start_period is not None:
        conditions.append(cube.c.period >= start_period)
    if end_period is not None:
        conditions.append(cube.c.period <= end_period)
    for name, value in filters.items():
        conditions.append(cube.c[name] == value)
    amount = func.coalesce(func.sum(cube.c.amount), 0)
    query = (
        select(
            *dimensions,
            amount.label("amount"),
            func.coalesce(func.sum(cube.c.charge_total), 0).label("charge_total"),
            func.coalesce(func.sum(cube.c.refund_total), 0).label("refund_total"),
            func.coalesce(func.sum(cube.c.transaction_count), 0).label(
                "transaction_count"
            ),
        )
        .where(and_(true(), *conditions))
        .group_by(*dimensions)
        .order_by(amount.desc(), *dimensions)
        .limit(limit)
    )
    rows = [
        SpendCubeRow(
            **{name: row[name] for name in group_by},
            amount=int(row["amount"]),
            charge_total=int(row["charge_total"]),
            refund_total=int(row["refund_total"]),
            transaction_count=int(row["transaction_count"]),
        )
        for row in (await db_session.execute(query)).mappings()
    ]
    total_amount = await db_session.scalar(
        select(func.coalesce(func.sum(cube.c.amount), 0)).where(
            and_(true(), *conditions)
        )
    )
    as_of = await load_as_of(db_session)
    undecided_total = await db_session.scalar(
        select(func.coalesce(func.sum(cube.c.amount), 0)).where(
            and_(*conditions, cube.c.adjustability == "undecided")
        )
    )
    return SpendCubeResponse(
        contract=MetricContract(
            definition=SPEND_CUBE_DEFINITION,
            scope=(
                "지출 큐브: 유효 KRW 지출을 월 × 카테고리 × 거래처 × 지급 형태 × "
                "조정 가능성으로 나눈 순지출(환불 차감, 대출 포함)"
            ),
            inclusion=flow_inclusion(),
            as_of=as_of,
            adjustability_undecided_total=int(undecided_total or 0),
            adjustability_undecided_share=ratio(
                int(undecided_total or 0), int(total_amount or 0)
            ),
            non_krw_transaction_count=await load_non_krw_count(db_session),
        ),
        group_by=[
            dimension for dimension in dict.fromkeys(group_by)
        ],  # validated against SpendCubeDimension by the response model
        total_amount=int(total_amount or 0),
        rows=rows,
    )


async def get_metric_data_status(db_session: AsyncSession) -> MetricDataStatusResponse:
    as_of = await load_as_of(db_session)
    summary = MONTHLY_FLOW_SUMMARY_VIEW
    closed = [
        row.period
        for row in await db_session.execute(
            select(summary.c.period)
            .where(summary.c.month_status == "closed")
            .order_by(summary.c.period.asc())
        )
    ]
    undecided, outflow = await load_undecided_totals(
        db_session, start_date=None, end_date=None
    )
    excluded = EXCLUDED_CURRENCY_VIEW
    excluded_rows = [
        ExcludedCurrencyItem(
            period=row["period"],
            currency=row["currency"],
            type=row["type"],
            signed_amount=int(row["signed_amount"]),
            transaction_count=int(row["transaction_count"]),
        )
        for row in (
            await db_session.execute(
                select(excluded).order_by(
                    excluded.c.period.asc(), excluded.c.currency.asc()
                )
            )
        ).mappings()
    ]
    return MetricDataStatusResponse(
        as_of=as_of,
        closed_periods=closed,
        in_progress_period=as_of.in_progress_period,
        adjustability_undecided_total=undecided,
        adjustability_undecided_share=ratio(undecided, outflow),
        total_outflow=outflow,
        excluded_currency=excluded_rows,
        non_krw_transaction_count=await load_non_krw_count(db_session),
    )


def _as_date(value: object) -> date | None:
    if value is None:
        return None
    if isinstance(value, date):
        return value
    return date.fromisoformat(str(value))


def _period_start(period: str) -> date:
    return date.fromisoformat(f"{period}-01")


def _period_end(period: str) -> date:
    start = _period_start(period)
    next_month = date(start.year + start.month // 12, start.month % 12 + 1, 1)
    return date.fromordinal(next_month.toordinal() - 1)
