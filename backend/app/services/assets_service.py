from datetime import date
from decimal import Decimal

from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.asset_snapshot import AssetSnapshot
from app.models.investment import Investment
from app.models.loan import Loan
from app.schemas.asset import (
    AssetSnapshotTotalsResponse,
    AssetSnapshotsResponse,
    InvestmentItemResponse,
    InvestmentSummaryResponse,
    InvestmentTotalsResponse,
    LoanItemResponse,
    LoanSummaryResponse,
    LoanTotalsResponse,
    NetWorthHistoryResponse,
    NetWorthPointResponse,
)


async def list_asset_snapshots(db_session: AsyncSession) -> AssetSnapshotsResponse:
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

    return AssetSnapshotsResponse(items=items)


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
