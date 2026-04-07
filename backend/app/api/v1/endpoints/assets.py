from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db_session
from app.schemas.asset import (
    AssetSnapshotComparisonResponse,
    AssetSnapshotsResponse,
    InvestmentSummaryResponse,
    LoanSummaryResponse,
    NetWorthHistoryResponse,
    SnapshotComparisonMode,
)
from app.services.assets_service import (
    get_asset_snapshot_comparison,
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


@router.get("/assets/snapshot-compare", response_model=AssetSnapshotComparisonResponse)
async def get_assets_snapshot_compare(
    comparison_mode: SnapshotComparisonMode = Query(
        default=SnapshotComparisonMode.LATEST_AVAILABLE_VS_PREVIOUS_AVAILABLE,
    ),
    snapshot_date: date | None = Query(default=None),
    baseline_snapshot_date: date | None = Query(default=None),
    db_session: AsyncSession = Depends(get_db_session),
) -> AssetSnapshotComparisonResponse:
    if (
        comparison_mode == SnapshotComparisonMode.SELECTED_SNAPSHOT_VS_BASELINE_SNAPSHOT
        and (snapshot_date is None or baseline_snapshot_date is None)
    ):
        raise HTTPException(
            status_code=422,
            detail="snapshot_date and baseline_snapshot_date are required for selected snapshot comparison",
        )
    try:
        return await get_asset_snapshot_comparison(
            db_session,
            comparison_mode=comparison_mode,
            snapshot_date=snapshot_date,
            baseline_snapshot_date=baseline_snapshot_date,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


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
