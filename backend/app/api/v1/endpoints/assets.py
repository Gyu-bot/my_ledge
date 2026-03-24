from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db_session
from app.schemas.asset import (
    AssetSnapshotsResponse,
    InvestmentSummaryResponse,
    LoanSummaryResponse,
    NetWorthHistoryResponse,
)
from app.services.assets_service import (
    get_investment_summary,
    get_loan_summary,
    get_net_worth_history,
    list_asset_snapshots,
)

router = APIRouter()


@router.get("/assets/snapshots", response_model=AssetSnapshotsResponse)
async def get_asset_snapshots(
    db_session: AsyncSession = Depends(get_db_session),
) -> AssetSnapshotsResponse:
    return await list_asset_snapshots(db_session)


@router.get("/assets/net-worth-history", response_model=NetWorthHistoryResponse)
async def get_asset_net_worth_history(
    db_session: AsyncSession = Depends(get_db_session),
) -> NetWorthHistoryResponse:
    return await get_net_worth_history(db_session)


@router.get("/investments/summary", response_model=InvestmentSummaryResponse)
async def get_investments_summary(
    snapshot_date: date | None = Query(default=None),
    db_session: AsyncSession = Depends(get_db_session),
) -> InvestmentSummaryResponse:
    return await get_investment_summary(db_session, snapshot_date)


@router.get("/loans/summary", response_model=LoanSummaryResponse)
async def get_loans_summary(
    snapshot_date: date | None = Query(default=None),
    db_session: AsyncSession = Depends(get_db_session),
) -> LoanSummaryResponse:
    return await get_loan_summary(db_session, snapshot_date)
