"""Comparison contract (T057) on real PostgreSQL views from ``alembic upgrade head``.

Set METRIC_TEST_DATABASE_URL (or REVIEW_TEST_DATABASE_URL) to a disposable
loopback server, e.g. ``postgresql+asyncpg://user:pass@127.0.0.1:55432/db``.
A scratch database is created, migrated, and dropped for this module. The
scenarios are the same ones ``test_comparison_contract.py`` runs on SQLite.
"""

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

import comparison_scenarios as scenarios
from test_metric_views_postgresql import (  # noqa: F401 - pytest fixtures
    migrated_url,
    pg_client,
    pg_session,
)


@pytest.mark.parametrize(
    "scenario",
    [
        scenarios.scenario_even_median_fewer_than_six,
        scenarios.scenario_in_progress_month,
        scenarios.scenario_no_data_vs_zero,
        scenarios.scenario_baseline_start_date,
        scenarios.scenario_contribution_ordering,
        scenarios.scenario_annual_expense,
        scenarios.scenario_annual_expense_short_history,
    ],
    ids=lambda scenario: scenario.__name__.removeprefix("scenario_"),
)
async def test_pg_comparison_scenario(
    scenario,
    pg_session: AsyncSession,  # noqa: F811 - fixture imported above
    pg_client: AsyncClient,  # noqa: F811
) -> None:
    await scenario(pg_session, pg_client)
