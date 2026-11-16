from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db_session
from app.core.security import require_api_key
from app.schemas.income_projection import (
    IncomeExpectationsSettings,
    ProjectionAccuracy,
)
from app.services.income_expectations_service import (
    get_income_expectations,
    save_income_expectations,
)
from app.services.monthly_projection_service import (
    resolve_projection_reference_date,
)
from app.services.projection_accuracy_service import get_projection_accuracy

router = APIRouter()


@router.get(
    "/canonical-views/month-projection/accuracy",
    response_model=ProjectionAccuracy,
    dependencies=[Depends(require_api_key)],
)
async def get_month_projection_accuracy(
    reference_date: date | None = Query(default=None),
    db_session: AsyncSession = Depends(get_db_session),
) -> ProjectionAccuracy:
    """Read-only replay error of the month-end forecast (T064 R12)."""
    if reference_date is None:
        reference_date, _ = await resolve_projection_reference_date(db_session)
    return await get_projection_accuracy(db_session, reference_date=reference_date)


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
