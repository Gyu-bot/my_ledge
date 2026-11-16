"""Agent read surface endpoints (T060). Reads only; every path needs X-API-Key."""

import logging
from datetime import date
from collections.abc import Awaitable, Callable
from typing import get_args

from fastapi import APIRouter, Depends, Query, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.validation import (
    UniformValidationRoute,
    query_error,
    reject_unknown_query_params,
)
from app.core.database import get_db_session
from app.core.security import require_api_key
from app.schemas.comparison import (
    BaselineMethod,
    ComparisonAdjustabilityView,
    ComparisonLevel,
)
from app.schemas.metrics import SpendCubeDimension
from app.schemas.read_surface import (
    CommitmentStatusFilter,
    CommitmentView,
    ContributionLists,
    ReadCommitmentsResponse,
    ReadComparisonResponse,
    ReadContributionsResponse,
    ReadDataStatusResponse,
    ReadErrorResponse,
    ReadMonthlyFlowResponse,
    ReadMonthProjectionResponse,
    ReadReviewItemsResponse,
    ReadSpendCubeResponse,
    ReadSurfaceIndexResponse,
    SpendCubeAdjustability,
    SpendCubeCommitmentKind,
    SpendCubeFlowRow,
    SpendCubePaymentForm,
)
from app.services.read_commitments_service import read_commitments
from app.services.read_review_items_service import read_review_items
from app.services.read_surface_index import build_index
from app.services.read_surface_service import (
    read_comparison,
    read_contributions,
    read_data_status,
    read_monthly_flow,
    read_month_projection,
    read_spend_cube,
)

from app.schemas.spending_limits import ReadSpendingReferenceResponse
from app.services.spending_limits_service import read_spending_reference

logger = logging.getLogger(__name__)

# Authentication first, then unknown query parameters (HTTP 422 naming each).
router = APIRouter(
    prefix="/read",
    dependencies=[Depends(require_api_key), Depends(reject_unknown_query_params)],
    route_class=UniformValidationRoute,
)

PERIOD_PATTERN = r"^[1-9]\d{3}-(0[1-9]|1[0-2])$"
BASELINE_DESCRIPTION = (
    "기준: median_of_recent_closed_months(기본, 최근 마감월 중앙값) 또는 "
    "previous_month(직전 마감월 한 달). 쓸 수 없는 기준은 null로 둔다."
)
_DIMENSIONS: tuple[str, ...] = get_args(SpendCubeDimension)
_ERROR_RESPONSES: dict[int | str, dict[str, object]] = {
    401: {"description": "인증 실패: X-API-Key가 없거나 틀림."},
    503: {"model": ReadErrorResponse, "description": "조회 실패."},
}


async def _guard[T: BaseModel](
    surface: str,
    db_session: AsyncSession,
    call: Callable[[], Awaitable[T]],
) -> T | JSONResponse:
    try:
        return await call()
    except SQLAlchemyError:
        logger.exception("read surface query failed: %s", surface)
        try:
            await db_session.rollback()
        except SQLAlchemyError:
            logger.exception("rollback after read failure failed: %s", surface)
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content=ReadErrorResponse(
                surface=surface,
                detail="자료를 읽는 중 데이터베이스 조회가 실패했다. 값은 반환하지 않는다.",
            ).model_dump(),
        )


@router.get(
    "/index", response_model=ReadSurfaceIndexResponse, responses=_ERROR_RESPONSES
)
async def get_read_index() -> ReadSurfaceIndexResponse:
    return build_index()


@router.get(
    "/monthly-flow",
    response_model=ReadMonthlyFlowResponse,
    responses=_ERROR_RESPONSES,
)
async def get_read_monthly_flow(
    start_period: str | None = Query(default=None, pattern=PERIOD_PATTERN),
    end_period: str | None = Query(default=None, pattern=PERIOD_PATTERN),
    db_session: AsyncSession = Depends(get_db_session),
) -> ReadMonthlyFlowResponse | JSONResponse:
    return await _guard(
        "monthly_flow",
        db_session,
        lambda: read_monthly_flow(
            db_session, start_period=start_period, end_period=end_period
        ),
    )


@router.get(
    "/spend-cube",
    response_model=ReadSpendCubeResponse,
    responses=_ERROR_RESPONSES,
)
async def get_read_spend_cube(
    start_period: str | None = Query(default=None, pattern=PERIOD_PATTERN),
    end_period: str | None = Query(default=None, pattern=PERIOD_PATTERN),
    group_by: str = Query(
        default="effective_category_major",
        description="Comma-separated dimensions: " + ", ".join(_DIMENSIONS),
    ),
    effective_category_major: str | None = Query(default=None, max_length=50),
    effective_category_minor: str | None = Query(default=None, max_length=50),
    merchant: str | None = Query(default=None, max_length=500),
    payment_form: SpendCubePaymentForm | None = Query(default=None),
    commitment_kind: SpendCubeCommitmentKind | None = Query(default=None),
    adjustability: SpendCubeAdjustability | None = Query(default=None),
    flow_row: SpendCubeFlowRow | None = Query(default=None),
    limit: int = Query(default=200, ge=1, le=2000),
    db_session: AsyncSession = Depends(get_db_session),
) -> ReadSpendCubeResponse | JSONResponse:
    dimensions = list(
        dict.fromkeys(item.strip() for item in group_by.split(",") if item.strip())
    )
    unknown = [item for item in dimensions if item not in _DIMENSIONS]
    if not dimensions or unknown:
        raise query_error(
            "group_by",
            "group_by must list one or more of: " + ", ".join(_DIMENSIONS),
            value=group_by,
            allowed=_DIMENSIONS,
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
    return await _guard(
        "spend_cube",
        db_session,
        lambda: read_spend_cube(
            db_session,
            start_period=start_period,
            end_period=end_period,
            group_by=dimensions,
            filters=filters,
            limit=limit,
        ),
    )


@router.get(
    "/comparison/monthly-flow",
    response_model=ReadComparisonResponse,
    responses=_ERROR_RESPONSES,
)
async def get_read_comparison(
    period: str | None = Query(
        default=None,
        pattern=PERIOD_PATTERN,
        description="대상 월. 생략하면 가장 최근 마감월(없으면 진행월).",
    ),
    baseline: BaselineMethod = Query(
        default="median_of_recent_closed_months",
        description=BASELINE_DESCRIPTION,
    ),
    db_session: AsyncSession = Depends(get_db_session),
) -> ReadComparisonResponse | JSONResponse:
    return await _guard(
        "comparison_monthly_flow",
        db_session,
        lambda: read_comparison(db_session, period=period, baseline=baseline),
    )


@router.get(
    "/comparison/contributions",
    response_model=ReadContributionsResponse,
    responses=_ERROR_RESPONSES,
)
async def get_read_contributions(
    period: str | None = Query(default=None, pattern=PERIOD_PATTERN),
    adjustability: ComparisonAdjustabilityView = Query(default="all"),
    level: ComparisonLevel = Query(default="category"),
    category: str | None = Query(default=None, max_length=50),
    limit: int = Query(default=100, ge=1, le=1000),
    baseline: BaselineMethod = Query(
        default="median_of_recent_closed_months",
        description=BASELINE_DESCRIPTION,
    ),
    lists: ContributionLists = Query(
        default="both",
        description=(
            "both(기본): 두 목록 모두. monthly: items만. twelve_month: "
            "twelve_month_items만. 요청하지 않은 목록은 빈 배열이고 *_summary.requested=false."
        ),
    ),
    db_session: AsyncSession = Depends(get_db_session),
) -> ReadContributionsResponse | JSONResponse:
    return await _guard(
        "comparison_contributions",
        db_session,
        lambda: read_contributions(
            db_session,
            period=period,
            adjustability=adjustability,
            level=level,
            category=category,
            limit=limit,
            baseline=baseline,
            lists=lists,
        ),
    )


@router.get(
    "/review-items",
    response_model=ReadReviewItemsResponse,
    responses=_ERROR_RESPONSES,
)
async def get_read_review_items(
    period: str | None = Query(
        default=None,
        pattern=PERIOD_PATTERN,
        description="대상 월. 생략하면 가장 최근 마감월(없으면 진행월).",
    ),
    limit: int = Query(default=50, ge=1, le=500),
    db_session: AsyncSession = Depends(get_db_session),
) -> ReadReviewItemsResponse | JSONResponse:
    return await _guard(
        "review_items",
        db_session,
        lambda: read_review_items(db_session, period=period, limit=limit),
    )


@router.get(
    "/commitments",
    response_model=ReadCommitmentsResponse,
    responses=_ERROR_RESPONSES,
)
async def get_read_commitments(
    period: str | None = Query(
        default=None,
        pattern=PERIOD_PATTERN,
        description="관측 여부를 볼 달. 생략하면 가장 최근 마감월(없으면 진행월).",
    ),
    commitment_status: CommitmentStatusFilter = Query(
        default="all",
        alias="status",
        description="active(진행 중) / ended(종료) / all(기본, 확인 불가 포함).",
    ),
    view: CommitmentView = Query(
        default="detail",
        description="detail(기본): items 전체. summary: item_summaries만(간단한 행).",
    ),
    db_session: AsyncSession = Depends(get_db_session),
) -> ReadCommitmentsResponse | JSONResponse:
    return await _guard(
        "commitments",
        db_session,
        lambda: read_commitments(
            db_session, period=period, status_filter=commitment_status, view=view
        ),
    )


@router.get(
    "/data-status",
    response_model=ReadDataStatusResponse,
    responses=_ERROR_RESPONSES,
)
async def get_read_data_status(
    db_session: AsyncSession = Depends(get_db_session),
) -> ReadDataStatusResponse | JSONResponse:
    return await _guard("data_status", db_session, lambda: read_data_status(db_session))


@router.get(
    "/spending-reference",
    response_model=ReadSpendingReferenceResponse,
    responses=_ERROR_RESPONSES,
)
async def get_read_spending_reference(
    period: str | None = Query(default=None, pattern=PERIOD_PATTERN),
    db_session: AsyncSession = Depends(get_db_session),
) -> ReadSpendingReferenceResponse | JSONResponse:
    return await _guard(
        "spending_reference",
        db_session,
        lambda: read_spending_reference(db_session, period=period),
    )


@router.get(
    "/month-projection",
    response_model=ReadMonthProjectionResponse,
    responses=_ERROR_RESPONSES,
)
async def get_read_month_projection(
    reference_date: date | None = Query(default=None),
    db_session: AsyncSession = Depends(get_db_session),
) -> ReadMonthProjectionResponse | JSONResponse:
    return await _guard(
        "month_end_projection",
        db_session,
        lambda: read_month_projection(db_session, reference_date=reference_date),
    )
