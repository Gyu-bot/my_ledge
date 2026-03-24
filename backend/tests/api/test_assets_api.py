from httpx import AsyncClient


async def test_asset_snapshots_returns_daily_totals(
    async_client: AsyncClient,
    seeded_finance_data: None,
) -> None:
    del seeded_finance_data

    response = await async_client.get("/api/v1/assets/snapshots")

    assert response.status_code == 200
    assert response.json() == {
        "items": [
            {
                "snapshot_date": "2026-03-24",
                "asset_total": "341467219.62",
                "liability_total": "234652971.00",
                "net_worth": "106814248.62",
            }
        ]
    }


async def test_net_worth_history_returns_series(
    async_client: AsyncClient,
    seeded_finance_data: None,
) -> None:
    del seeded_finance_data

    response = await async_client.get("/api/v1/assets/net-worth-history")

    assert response.status_code == 200
    assert response.json() == {
        "items": [
            {
                "snapshot_date": "2026-03-24",
                "net_worth": "106814248.62",
            }
        ]
    }


async def test_investments_summary_uses_latest_snapshot_by_default(
    async_client: AsyncClient,
    seeded_finance_data: None,
) -> None:
    del seeded_finance_data

    response = await async_client.get("/api/v1/investments/summary")

    assert response.status_code == 200
    payload = response.json()
    assert payload["snapshot_date"] == "2026-03-24"
    assert payload["totals"]["market_value"] == "16254103.61"
    assert len(payload["items"]) == 11


async def test_loans_summary_uses_latest_snapshot_by_default(
    async_client: AsyncClient,
    seeded_finance_data: None,
) -> None:
    del seeded_finance_data

    response = await async_client.get("/api/v1/loans/summary")

    assert response.status_code == 200
    payload = response.json()
    assert payload["snapshot_date"] == "2026-03-24"
    assert payload["totals"]["balance"] == "234652971.00"
    assert len(payload["items"]) == 5
