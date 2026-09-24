from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession


# A database transaction lock shared by recurring approvals and configuration
# writers, including workers in other processes. Regular GETs never acquire it.
_RECURRING_CONFIGURATION_LOCK = 0x4D4C5245435552


async def lock_recurring_configuration(db_session: AsyncSession) -> None:
    if db_session.get_bind().dialect.name != "postgresql":
        return
    # Always acquire this before rule/settings/transaction row locks. Avoid
    # autoflushing caller state while waiting for this serialization point.
    with db_session.no_autoflush:
        await db_session.execute(
            select(func.pg_advisory_xact_lock(_RECURRING_CONFIGURATION_LOCK))
        )
