from typing import get_args

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db_session
from app.core.security import require_api_key
from app.schemas.metrics import (
    MetricDataStatusResponse,
    MonthlyFlowResponse,
    SpendCubeDimension,
    SpendCubeResponse,
)
from app.services.metrics_service import (
    get_metric_data_status,
    get_monthly_flow,
    get_spend_cube,
)

router = APIRouter()

PERIOD_PATTERN = r"^[1-9]\d{3}-(0[1-9]|1[0-2])$"
_DIMENSIONS: tuple[str, ...] = get_args(SpendCubeDimension)


@router.get(
    "/metrics/monthly-flow",
    response_model=MonthlyFlowResponse,
    dependencies=[Depends(require_api_key)],
)
async def get_metrics_monthly_flow(
    start_period: str | None = Query(default=None, pattern=PERIOD_PATTERN),
    end_period: str | None = Query(default=None, pattern=PERIOD_PATTERN),
    db_session: AsyncSession = Depends(get_db_session),
) -> MonthlyFlowResponse:
    return await get_monthly_flow(
        db_session, start_period=start_period, end_period=end_period
    )


@router.get(
    "/metrics/spend-cube",
    response_model=SpendCubeResponse,
    dependencies=[Depends(require_api_key)],
)
async def get_metrics_spend_cube(
    start_period: str | None = Query(default=None, pattern=PERIOD_PATTERN),
    end_period: str | None = Query(default=None, pattern=PERIOD_PATTERN),
    group_by: str = Query(
        default="effective_category_major",
        description="Comma-separated dimensions: " + ", ".join(_DIMENSIONS),
    ),
    effective_category_major: str | None = Query(default=None, max_length=50),
    effective_category_minor: str | None = Query(default=None, max_length=50),
    merchant: str | None = Query(default=None, max_length=500),
    payment_form: str | None = Query(default=None, max_length=20),
    commitment_kind: str | None = Query(default=None, max_length=20),
    adjustability: str | None = Query(default=None, max_length=20),
    flow_row: str | None = Query(default=None, max_length=40),
    limit: int = Query(default=200, ge=1, le=2000),
    db_session: AsyncSession = Depends(get_db_session),
) -> SpendCubeResponse:
    dimensions = [item.strip() for item in group_by.split(",") if item.strip()]
    unknown = [item for item in dimensions if item not in _DIMENSIONS]
    if not dimensions or unknown:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=("group_by must list one or more of: " + ", ".join(_DIMENSIONS)),
        )
    filters = {
        name: value
        for name, value in {
            "effective_category_major": effective_category_major,
            "effective_category_minor": effective_category_minor,
            "merchant": merchant,
            "payment_form": payment_form,
            "commitment_kind": commitment_kind,
            "adjustability": adjustability,
            "flow_row": flow_row,
        }.items()
        if value is not None
    }
    return await get_spend_cube(
        db_session,
        start_period=start_period,
        end_period=end_period,
        group_by=dimensions,
        filters=filters,
        limit=limit,
    )


@router.get(
    "/metrics/data-status",
    response_model=MetricDataStatusResponse,
    dependencies=[Depends(require_api_key)],
)
async def get_metrics_data_status(
    db_session: AsyncSession = Depends(get_db_session),
) -> MetricDataStatusResponse:
    return await get_metric_data_status(db_session)
