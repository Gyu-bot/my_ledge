from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.app_setting import AppSetting
from app.schemas.income_projection import IncomeExpectationsSettings

_SCOPE = "forecast.income_expectations"


async def get_income_expectations(
    db_session: AsyncSession,
) -> IncomeExpectationsSettings:
    row = await db_session.scalar(
        select(AppSetting).where(AppSetting.scope == _SCOPE, AppSetting.key == "items")
    )
    if row is None:
        return IncomeExpectationsSettings()
    return IncomeExpectationsSettings.model_validate_json(row.value)


async def save_income_expectations(
    db_session: AsyncSession, payload: IncomeExpectationsSettings
) -> IncomeExpectationsSettings:
    row = await db_session.scalar(
        select(AppSetting).where(AppSetting.scope == _SCOPE, AppSetting.key == "items")
    )
    if row is None:
        row = AppSetting(scope=_SCOPE, key="items", value=payload.model_dump_json())
        db_session.add(row)
    else:
        row.value = payload.model_dump_json()
    await db_session.commit()
    return payload
