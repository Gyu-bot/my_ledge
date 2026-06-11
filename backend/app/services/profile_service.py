from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user_profile_snapshot import UserProfileSnapshot
from app.schemas.profile import CreditScoreHistoryItem, ProfileResponse


async def get_profile(db_session: AsyncSession) -> ProfileResponse:
    latest = await db_session.scalar(
        select(UserProfileSnapshot).order_by(
            UserProfileSnapshot.snapshot_date.desc(),
            UserProfileSnapshot.id.desc(),
        )
    )
    history_result = await db_session.execute(
        select(UserProfileSnapshot)
        .where(UserProfileSnapshot.credit_score_kcb.is_not(None))
        .order_by(UserProfileSnapshot.snapshot_date.asc())
    )
    credit_score_history = [
        CreditScoreHistoryItem(
            snapshot_date=row.snapshot_date,
            credit_score_kcb=row.credit_score_kcb,
        )
        for row in history_result.scalars().all()
    ]
    if latest is None:
        return ProfileResponse(
            snapshot_date=None,
            gender=None,
            age=None,
            credit_score_kcb=None,
            credit_score_history=[],
        )
    return ProfileResponse(
        snapshot_date=latest.snapshot_date,
        gender=latest.gender,
        age=latest.age,
        credit_score_kcb=latest.credit_score_kcb,
        credit_score_history=credit_score_history,
    )
