"""T062 scenarios on real PostgreSQL migrated through additive 0040."""

import pytest
from test_metric_views_postgresql import migrated_url, pg_client, pg_session  # noqa: F401
from test_spending_limits import SCENARIOS


@pytest.mark.parametrize("scenario", SCENARIOS, ids=lambda fn: fn.__name__)
async def test_spending_reference_postgresql(scenario, pg_session, pg_client):  # noqa: F811
    await scenario(pg_session, pg_client)


async def test_concurrent_limit_creation_is_serialized(pg_session):  # noqa: F811
    import asyncio

    from fastapi import HTTPException
    from sqlalchemy import func, select
    from sqlalchemy.ext.asyncio import async_sessionmaker

    from app.models.spending_limit import SpendingLimitRevision
    from app.schemas.spending_limits import SpendingLimitCreate
    from app.services.spending_limits_service import create_limit

    factory = async_sessionmaker(pg_session.bind, expire_on_commit=False)

    async def create(amount):
        async with factory() as db:
            try:
                await create_limit(
                    db,
                    SpendingLimitCreate(
                        target_kind="category",
                        target_value="concurrent-synthetic",
                        effective_from_period="2031-01",
                        amount=amount,
                    ),
                )
                return 201
            except HTTPException as exc:
                return exc.status_code

    assert sorted(await asyncio.gather(create(100), create(200))) == [201, 409]
    assert (
        await pg_session.scalar(select(func.count()).select_from(SpendingLimitRevision))
        == 1
    )
