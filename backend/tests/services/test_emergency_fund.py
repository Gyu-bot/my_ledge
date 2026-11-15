"""T061 emergency fund months on the 재무상태 side (plan 3.3)."""

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from net_worth_scenarios import D2, build_net_worth_scenario

PATH = "/api/v1/metrics/net-worth/emergency-fund"


async def test_emergency_fund_formula_and_undecided_share(
    async_client: AsyncClient, api_headers: dict[str, str], db_session: AsyncSession
) -> None:
    await build_net_worth_scenario(db_session)
    payload = (await async_client.get(PATH, headers=api_headers)).json()

    assert payload["asset_snapshot_date"] == D2.isoformat()
    # account-a (flagged cash) + deposit-b (name rule only); the savings row
    # flagged not-cash and the near_liquid investment row are excluded.
    assert payload["cash_like_total"] == 6_980_000
    assert payload["cash_like_name_rule_total"] == 400_000
    baseline = payload["baseline"]
    assert baseline["periods"] == ["2026-01", "2026-02", "2026-03"]
    assert baseline["status"] == "fewer_than_requested"
    assert baseline["limited_by"] == "data_start"
    assert baseline["last_closed_period"] == "2026-03"
    # protected_spend by month: 950,000 / 1,020,000 / 1,600,001 -> median.
    assert payload["monthly_protected_outflow"] == 1_020_000
    assert payload["monthly_adjustability_undecided_outflow"] == 0
    assert payload["adjustability_undecided_share"] == round(100_000 / 3_670_001, 4)
    assert payload["emergency_fund_months"] == round(6_980_000 / 1_020_000, 2)
    assert payload["status"] == "incomplete_classification"
    assert payload["formula"].startswith("emergency_fund_months = cash_like_total")
    assert "legacy" in payload["legacy_surface"]
    assert payload["contract"]["definition"] == "emergency_fund.v1"


async def test_baseline_start_date_limits_the_months(
    async_client: AsyncClient, api_headers: dict[str, str], db_session: AsyncSession
) -> None:
    await build_net_worth_scenario(db_session)
    setting = await async_client.patch(
        "/api/v1/settings/analytics",
        json={"comparison": {"baseline_start_date": "2026-02-15"}},
        headers=api_headers,
    )
    assert setting.status_code == 200, setting.text
    payload = (await async_client.get(PATH, headers=api_headers)).json()
    assert payload["baseline"]["periods"] == ["2026-03"]
    assert payload["baseline"]["limited_by"] == "baseline_start_date"
    assert payload["monthly_protected_outflow"] == 1_600_001
    assert payload["adjustability_undecided_share"] == 0
    assert payload["status"] == "complete"


async def test_emergency_fund_states_without_data(
    async_client: AsyncClient, api_headers: dict[str, str]
) -> None:
    payload = (await async_client.get(PATH, headers=api_headers)).json()
    assert payload["status"] == "no_asset_snapshot"
    assert payload["emergency_fund_months"] is None
    assert payload["baseline"]["status"] == "none"


async def test_legacy_liquidity_health_is_unchanged(
    async_client: AsyncClient, api_headers: dict[str, str], db_session: AsyncSession
) -> None:
    await build_net_worth_scenario(db_session)
    response = await async_client.get(
        "/api/v1/analytics/liquidity-health", headers=api_headers
    )
    assert response.status_code == 200
    assert "emergency_fund_months" in response.json()
