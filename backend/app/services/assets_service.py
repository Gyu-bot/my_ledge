import calendar
from datetime import date
from decimal import Decimal

from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.asset_snapshot import AssetSnapshot
from app.models.investment import Investment
from app.models.loan import Loan
from app.schemas.asset import (
    AssetSnapshotTotalsResponse,
    AssetSnapshotComparisonDeltaResponse,
    AssetSnapshotComparisonResponse,
    AssetSnapshotsResponse,
    InvestmentItemResponse,
    InvestmentSummaryResponse,
    InvestmentTotalsResponse,
    LoanItemResponse,
    LoanSummaryResponse,
    LoanTotalsResponse,
    NetWorthHistoryResponse,
    NetWorthPointResponse,
    SnapshotComparisonMode,
)


async def list_asset_snapshots(db_session: AsyncSession) -> AssetSnapshotsResponse:
    items = await _load_asset_snapshot_totals(db_session)
    return AssetSnapshotsResponse(items=items)


async def get_asset_snapshot_comparison(
    db_session: AsyncSession,
    *,
    comparison_mode: SnapshotComparisonMode = SnapshotComparisonMode.LATEST_AVAILABLE_VS_PREVIOUS_AVAILABLE,
    snapshot_date: date | None = None,
    baseline_snapshot_date: date | None = None,
) -> AssetSnapshotComparisonResponse:
    snapshots = await _load_asset_snapshot_totals(db_session)
    current, baseline = _resolve_comparison_pair(
        snapshots,
        comparison_mode=comparison_mode,
        snapshot_date=snapshot_date,
        baseline_snapshot_date=baseline_snapshot_date,
    )
    if current is None:
        return AssetSnapshotComparisonResponse(
            comparison_mode=comparison_mode,
            current=None,
            baseline=None,
            delta=None,
            comparison_days=None,
            is_partial=False,
            is_stale=False,
            can_compare=False,
            comparison_label="비교 기준 부족",
        )

    is_stale = _is_stale_snapshot(current.snapshot_date)
    if baseline is None:
        return AssetSnapshotComparisonResponse(
            comparison_mode=comparison_mode,
            current=current,
            baseline=None,
            delta=None,
            comparison_days=None,
            is_partial=False,
            is_stale=is_stale,
            can_compare=False,
            comparison_label="비교 기준 부족",
        )

    is_partial = (
        comparison_mode != SnapshotComparisonMode.LAST_CLOSED_MONTH_VS_PREVIOUS_CLOSED_MONTH
        and not _is_month_end(current.snapshot_date)
    )
    return AssetSnapshotComparisonResponse(
        comparison_mode=comparison_mode,
        current=current,
        baseline=baseline,
        delta=AssetSnapshotComparisonDeltaResponse(
            asset_total=current.asset_total - baseline.asset_total,
            liability_total=current.liability_total - baseline.liability_total,
            net_worth=current.net_worth - baseline.net_worth,
            asset_total_pct=_safe_ratio(current.asset_total - baseline.asset_total, baseline.asset_total),
            liability_total_pct=_safe_ratio(current.liability_total - baseline.liability_total, baseline.liability_total),
            net_worth_pct=_safe_ratio(current.net_worth - baseline.net_worth, baseline.net_worth),
        ),
        comparison_days=(current.snapshot_date - baseline.snapshot_date).days,
        is_partial=is_partial,
        is_stale=is_stale,
        can_compare=True,
        comparison_label=_build_comparison_label(
            comparison_mode=comparison_mode,
            is_partial=is_partial,
            is_stale=is_stale,
        ),
    )


async def _load_asset_snapshot_totals(db_session: AsyncSession) -> list[AssetSnapshotTotalsResponse]:
    asset_case = case((AssetSnapshot.side == "asset", AssetSnapshot.amount), else_=0)
    liability_case = case((AssetSnapshot.side == "liability", AssetSnapshot.amount), else_=0)
    result = await db_session.execute(
        select(
            AssetSnapshot.snapshot_date,
            func.sum(asset_case).label("asset_total"),
            func.sum(liability_case).label("liability_total"),
        )
        .group_by(AssetSnapshot.snapshot_date)
        .order_by(AssetSnapshot.snapshot_date)
    )

    items = []
    for snapshot_date, asset_total, liability_total in result.all():
        asset_value = Decimal(asset_total or 0)
        liability_value = Decimal(liability_total or 0)
        items.append(
            AssetSnapshotTotalsResponse(
                snapshot_date=snapshot_date,
                asset_total=asset_value,
                liability_total=liability_value,
                net_worth=asset_value - liability_value,
            )
        )
    return items


async def get_net_worth_history(db_session: AsyncSession) -> NetWorthHistoryResponse:
    snapshots = await list_asset_snapshots(db_session)
    return NetWorthHistoryResponse(
        items=[
            NetWorthPointResponse(
                snapshot_date=item.snapshot_date,
                net_worth=item.net_worth,
            )
            for item in snapshots.items
        ]
    )


async def get_investment_summary(
    db_session: AsyncSession,
    snapshot_date: date | None,
) -> InvestmentSummaryResponse:
    resolved_snapshot_date = await _resolve_snapshot_date(
        db_session,
        Investment.snapshot_date,
        snapshot_date,
    )
    if resolved_snapshot_date is None:
        return InvestmentSummaryResponse(
            snapshot_date=None,
            items=[],
            totals=InvestmentTotalsResponse(
                cost_basis=Decimal("0"),
                market_value=Decimal("0"),
            ),
        )

    result = await db_session.execute(
        select(Investment)
        .where(Investment.snapshot_date == resolved_snapshot_date)
        .order_by(Investment.broker, Investment.product_name)
    )
    items = [InvestmentItemResponse.model_validate(row, from_attributes=True) for row in result.scalars()]
    return InvestmentSummaryResponse(
        snapshot_date=resolved_snapshot_date,
        items=items,
        totals=InvestmentTotalsResponse(
            cost_basis=sum((item.cost_basis or Decimal("0")) for item in items),
            market_value=sum((item.market_value or Decimal("0")) for item in items),
        ),
    )


async def get_loan_summary(
    db_session: AsyncSession,
    snapshot_date: date | None,
) -> LoanSummaryResponse:
    resolved_snapshot_date = await _resolve_snapshot_date(
        db_session,
        Loan.snapshot_date,
        snapshot_date,
    )
    if resolved_snapshot_date is None:
        return LoanSummaryResponse(
            snapshot_date=None,
            items=[],
            totals=LoanTotalsResponse(
                principal=Decimal("0"),
                balance=Decimal("0"),
            ),
        )

    result = await db_session.execute(
        select(Loan)
        .where(Loan.snapshot_date == resolved_snapshot_date)
        .order_by(Loan.lender, Loan.product_name)
    )
    items = [LoanItemResponse.model_validate(row, from_attributes=True) for row in result.scalars()]
    return LoanSummaryResponse(
        snapshot_date=resolved_snapshot_date,
        items=items,
        totals=LoanTotalsResponse(
            principal=sum((item.principal or Decimal("0")) for item in items),
            balance=sum((item.balance or Decimal("0")) for item in items),
        ),
    )


async def _resolve_snapshot_date(
    db_session: AsyncSession,
    model_field,
    requested_snapshot_date: date | None,
) -> date | None:
    if requested_snapshot_date is not None:
        return requested_snapshot_date
    return await db_session.scalar(select(func.max(model_field)))


def _resolve_comparison_pair(
    snapshots: list[AssetSnapshotTotalsResponse],
    *,
    comparison_mode: SnapshotComparisonMode,
    snapshot_date: date | None,
    baseline_snapshot_date: date | None,
) -> tuple[AssetSnapshotTotalsResponse | None, AssetSnapshotTotalsResponse | None]:
    if not snapshots:
        return None, None

    snapshot_map = {item.snapshot_date: item for item in snapshots}

    if comparison_mode == SnapshotComparisonMode.LATEST_AVAILABLE_VS_PREVIOUS_AVAILABLE:
        current = snapshots[-1]
        baseline = snapshots[-2] if len(snapshots) > 1 else None
        return current, baseline

    if comparison_mode == SnapshotComparisonMode.LAST_CLOSED_MONTH_VS_PREVIOUS_CLOSED_MONTH:
        closed_months = [item for item in snapshots if _is_month_end(item.snapshot_date)]
        current = closed_months[-1] if closed_months else None
        baseline = closed_months[-2] if len(closed_months) > 1 else None
        return current, baseline

    if comparison_mode == SnapshotComparisonMode.SELECTED_SNAPSHOT_VS_BASELINE_SNAPSHOT:
        if snapshot_date is None or baseline_snapshot_date is None:
            raise ValueError("snapshot_date and baseline_snapshot_date are required")
        current = snapshot_map.get(snapshot_date)
        baseline = snapshot_map.get(baseline_snapshot_date)
        if current is None or baseline is None:
            raise ValueError("requested snapshot pair does not exist")
        return current, baseline

    raise ValueError(f"unsupported comparison mode: {comparison_mode}")


def _is_month_end(value: date) -> bool:
    return value.day == calendar.monthrange(value.year, value.month)[1]


def _build_comparison_label(
    *,
    comparison_mode: SnapshotComparisonMode,
    is_partial: bool,
    is_stale: bool,
) -> str:
    if comparison_mode == SnapshotComparisonMode.LAST_CLOSED_MONTH_VS_PREVIOUS_CLOSED_MONTH:
        base_label = "마감월 기준"
    elif is_partial:
        base_label = "부분 기간"
    elif comparison_mode == SnapshotComparisonMode.SELECTED_SNAPSHOT_VS_BASELINE_SNAPSHOT:
        base_label = "선택 스냅샷 기준"
    else:
        base_label = "최신 스냅샷 기준"

    if is_stale:
        return f"{base_label} / stale snapshot"
    return base_label


def _today() -> date:
    return date.today()


def _is_stale_snapshot(snapshot_date: date) -> bool:
    return (_today() - snapshot_date).days > 35


def _safe_ratio(numerator: Decimal, denominator: Decimal) -> float | None:
    if denominator == 0:
        return None
    return round(float(numerator / denominator), 4)
