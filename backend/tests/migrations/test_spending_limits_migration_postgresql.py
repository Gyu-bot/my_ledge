"""0040 is additive: existing table schemas, rows and metric values are preserved."""

import asyncio

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from test_nature_axes_migration_postgresql import _alembic, scratch_url  # noqa: F401


def test_limit_migration_preserves_existing_tables(scratch_url):  # noqa: F811
    _alembic(scratch_url, "upgrade", "20261117_t054_t057")

    async def capture(seed=False):
        engine = create_async_engine(scratch_url)
        async with engine.begin() as connection:
            if seed:
                await connection.execute(
                    text(
                        "INSERT INTO transactions (date, time, type, description, merchant, category_major, amount, currency) VALUES ('2030-01-01', '12:00', '지출', 'synthetic-merchant', 'synthetic-merchant', 'synthetic-category', -1200, 'KRW')"
                    )
                )
            names = (
                (
                    await connection.execute(
                        text(
                            "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename NOT IN ('alembic_version', 'spending_limit_revisions') ORDER BY tablename"
                        )
                    )
                )
                .scalars()
                .all()
            )
            rows = {}
            for name in names:
                rows[name] = (
                    (
                        await connection.execute(
                            text(
                                f'SELECT row_to_json(t)::text FROM "{name}" t ORDER BY row_to_json(t)::text'
                            )
                        )
                    )
                    .scalars()
                    .all()
                )
            columns = (
                await connection.execute(
                    text(
                        "SELECT table_name, column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema='public' AND table_name NOT IN ('alembic_version', 'spending_limit_revisions') ORDER BY table_name, ordinal_position"
                    )
                )
            ).all()
            flow = (
                (
                    await connection.execute(
                        text(
                            "SELECT row_to_json(t)::text FROM vw_monthly_flow_summary t ORDER BY period"
                        )
                    )
                )
                .scalars()
                .all()
            )
            result = rows, columns, flow
        await engine.dispose()
        return result

    before = asyncio.run(capture(seed=True))
    _alembic(scratch_url, "upgrade", "head")
    assert asyncio.run(capture()) == before
    _alembic(scratch_url, "downgrade", "20261117_t054_t057")
    assert asyncio.run(capture()) == before
