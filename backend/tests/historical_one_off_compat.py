"""Expose the empty T067 contract to HTTP readers in older migration tests.

The adapters live only in a rolled-back transaction on each scratch database.
The original historical views and their data remain under the catalog checks.
"""

from contextlib import asynccontextmanager

from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.models.one_off_event import OneOffEvent, OneOffEventMember


@asynccontextmanager
async def historical_read_factory(engine):
    async with engine.connect() as connection:
        transaction = await connection.begin()
        try:
            for model in (OneOffEvent, OneOffEventMember):
                await connection.run_sync(model.__table__.create)
            views = (
                ("vw_metric_flow_lines", "NULL::integer AS one_off_event_id"),
                (
                    "vw_monthly_flow_summary",
                    "0::bigint AS one_off_total, old.total_outflow AS ongoing_outflow, "
                    "old.living_spend AS ongoing_living_spend",
                ),
            )
            for name, fields in views:
                original = await connection.scalar(
                    text("SELECT pg_get_viewdef(to_regclass(:view_name))"),
                    {"view_name": name},
                )
                await connection.exec_driver_sql(
                    f"CREATE OR REPLACE VIEW {name} AS "
                    f"SELECT old.*, {fields} FROM ({original.rstrip().removesuffix(';')}) AS old"
                )
            yield async_sessionmaker(connection, expire_on_commit=False)
        finally:
            await transaction.rollback()
