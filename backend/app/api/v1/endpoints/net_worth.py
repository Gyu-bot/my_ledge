"""재무상태 read endpoints (T061). Every route requires X-API-Key."""

from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db_session
from app.core.security import require_api_key
from app.schemas.net_worth import (
    EmergencyFundResponse,
    NetWorthReconciliationResponse,
    SnapshotIntervalsResponse,
)
from app.services.net_worth_service import (
    get_emergency_fund,
    get_net_worth_reconciliation,
    list_snapshot_intervals,
)

router = APIRouter(prefix="/metrics/net-worth", dependencies=[Depends(require_api_key)])


@router.get("/intervals", response_model=SnapshotIntervalsResponse)
async def get_net_worth_intervals(
    limit: int = Query(default=24, ge=1, le=200),
    db_session: AsyncSession = Depends(get_db_session),
) -> SnapshotIntervalsResponse:
    return await list_snapshot_intervals(db_session, limit=limit)


@router.get("/reconciliation", response_model=NetWorthReconciliationResponse)
async def get_net_worth_reconciliation_endpoint(
    start_date: date | None = Query(
        default=None, description="시작 자산 스냅샷일. 생략하면 최근 두 스냅샷."
    ),
    end_date: date | None = Query(default=None, description="끝 자산 스냅샷일."),
    db_session: AsyncSession = Depends(get_db_session),
) -> NetWorthReconciliationResponse:
    return await get_net_worth_reconciliation(
        db_session, start_date=start_date, end_date=end_date
    )


@router.get("/emergency-fund", response_model=EmergencyFundResponse)
async def get_emergency_fund_endpoint(
    db_session: AsyncSession = Depends(get_db_session),
) -> EmergencyFundResponse:
    return await get_emergency_fund(db_session)
