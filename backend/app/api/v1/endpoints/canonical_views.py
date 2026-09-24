from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db_session
from app.core.security import require_api_key
from app.schemas.canonical_views import CanonicalViewsDashboardResponse
from app.schemas.income_projection import IncomeExpectationsSettings
from app.services.income_expectations_service import (
    get_income_expectations,
    save_income_expectations,
)
from app.services.canonical_views_dashboard_service import (
    get_canonical_views_dashboard,
)

router = APIRouter()


@router.get(
    "/canonical-views/dashboard",
    response_model=CanonicalViewsDashboardResponse,
    dependencies=[Depends(require_api_key)],
)
async def get_canonical_dashboard(
    months: int = Query(default=12, ge=1, le=36),
    merchant_limit: int = Query(default=10, ge=1, le=50),
    queue_limit: int = Query(default=10, ge=1, le=100),
    queue_page: int = Query(default=1, ge=1),
    search: str | None = Query(default=None, max_length=200),
    issue_types: str | None = Query(default=None),
    period_from: str | None = Query(
        default=None, pattern=r"^[1-9]\d{3}-(0[1-9]|1[0-2])$"
    ),
    period_to: str | None = Query(
        default=None, pattern=r"^[1-9]\d{3}-(0[1-9]|1[0-2])$"
    ),
    current_only: bool = Query(default=False),
    reference_date: date | None = Query(default=None),
    db_session: AsyncSession = Depends(get_db_session),
) -> CanonicalViewsDashboardResponse:
    return await get_canonical_views_dashboard(
        db_session,
        months=months,
        merchant_limit=merchant_limit,
        queue_limit=queue_limit,
        queue_page=queue_page,
        search=search,
        issue_types=issue_types,
        period_from=period_from,
        period_to=period_to,
        current_only=current_only,
        reference_date=reference_date,
    )


@router.get(
    "/settings/income-expectations",
    response_model=IncomeExpectationsSettings,
    dependencies=[Depends(require_api_key)],
)
async def get_income_expectations_endpoint(
    db_session: AsyncSession = Depends(get_db_session),
) -> IncomeExpectationsSettings:
    return await get_income_expectations(db_session)


@router.patch(
    "/settings/income-expectations",
    response_model=IncomeExpectationsSettings,
    dependencies=[Depends(require_api_key)],
)
async def patch_income_expectations_endpoint(
    payload: IncomeExpectationsSettings,
    db_session: AsyncSession = Depends(get_db_session),
) -> IncomeExpectationsSettings:
    return await save_income_expectations(db_session, payload)
