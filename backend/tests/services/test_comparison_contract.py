"""Comparison contract (T057) on SQLite views. PostgreSQL: test_comparison_postgresql."""

from datetime import date

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

import comparison_scenarios as scenarios
from app.services.comparison_service import median_won, resolve_comparison_window
from app.services.settings_service import baseline_start_period


@pytest.mark.parametrize(
    ("values", "expected"),
    [
        ([], None),
        ([5], 5),
        ([3, 1, 2], 2),
        ([1, 2], 2),  # 1.5 rounds half up
        ([10, 20, 30, 40], 25),
        ([-3, -2], -3),  # −2.5 rounds half away from zero
        ([0, 0, 7, 9], 4),  # 3.5 -> 4
    ],
)
def test_median_won(values: list[int], expected: int | None) -> None:
    assert median_won(values) == expected


def test_baseline_start_period_counts_only_months_after_the_date() -> None:
    assert baseline_start_period(None) is None
    assert baseline_start_period(date(2026, 5, 1)) == "2026-05"
    assert baseline_start_period(date(2026, 5, 2)) == "2026-06"
    assert baseline_start_period(date(2026, 12, 31)) == "2027-01"


async def test_window_without_data_has_no_baseline(db_session: AsyncSession) -> None:
    window = await resolve_comparison_window(db_session)
    assert window.target_period is None
    assert window.baseline_periods == ()


async def test_comparison_endpoints_require_api_key(async_client: AsyncClient) -> None:
    for path in ("monthly-flow", "contributions"):
        response = await async_client.get(f"/api/v1/metrics/comparison/{path}")
        assert response.status_code == 401


async def test_comparison_endpoints_on_empty_data(
    async_client: AsyncClient,
) -> None:
    flow = await scenarios.get(async_client, "/metrics/comparison/monthly-flow")
    assert flow["comparison"]["target_period"] is None
    assert flow["comparison"]["baseline_status"] == "none"
    assert flow["residual_rate"] is None
    contributions = await scenarios.get(
        async_client, "/metrics/comparison/contributions"
    )
    assert contributions["items"] == []
    assert contributions["target_total"] is None


async def test_even_median_with_fewer_than_six_closed_months(
    db_session: AsyncSession, async_client: AsyncClient
) -> None:
    await scenarios.scenario_even_median_fewer_than_six(db_session, async_client)


async def test_in_progress_month_uses_same_elapsed_days(
    db_session: AsyncSession, async_client: AsyncClient
) -> None:
    await scenarios.scenario_in_progress_month(db_session, async_client)


async def test_no_data_month_is_not_a_zero_month(
    db_session: AsyncSession, async_client: AsyncClient
) -> None:
    await scenarios.scenario_no_data_vs_zero(db_session, async_client)


async def test_baseline_start_date_changes_every_comparison(
    db_session: AsyncSession, async_client: AsyncClient
) -> None:
    await scenarios.scenario_baseline_start_date(db_session, async_client)


async def test_contributions_ordered_by_won_with_adjustability_split(
    db_session: AsyncSession, async_client: AsyncClient
) -> None:
    await scenarios.scenario_contribution_ordering(db_session, async_client)


async def test_annual_expense_uses_twelve_month_window(
    db_session: AsyncSession, async_client: AsyncClient
) -> None:
    await scenarios.scenario_annual_expense(db_session, async_client)


async def test_annual_expense_without_prior_year_has_no_baseline(
    db_session: AsyncSession, async_client: AsyncClient
) -> None:
    await scenarios.scenario_annual_expense_short_history(db_session, async_client)
