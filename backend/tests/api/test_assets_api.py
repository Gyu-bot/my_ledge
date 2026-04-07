from datetime import date

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.upload_service import import_transactions_from_workbook


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


async def test_asset_endpoints_return_multi_snapshot_history_and_latest_defaults(
    async_client: AsyncClient,
    db_session: AsyncSession,
    sample_workbook_bytes: bytes,
    rolling_window_workbook_bytes: bytes,
    rolling_window_workbook_v2_bytes: bytes,
    latest_workbook_bytes: bytes,
) -> None:
    workbooks = [
        ("finance_sample.xlsx", date(2026, 3, 11), sample_workbook_bytes),
        ("sample_260324.xlsx", date(2026, 3, 24), rolling_window_workbook_bytes),
        ("sample_260326.xlsx", date(2026, 3, 26), rolling_window_workbook_v2_bytes),
        ("sample_260407.xlsx", date(2026, 4, 7), latest_workbook_bytes),
    ]
    for filename, snapshot_date, workbook_bytes in workbooks:
        await import_transactions_from_workbook(
            db_session=db_session,
            file_bytes=workbook_bytes,
            filename=filename,
            snapshot_date=snapshot_date,
        )

    snapshots_response = await async_client.get("/api/v1/assets/snapshots")
    history_response = await async_client.get("/api/v1/assets/net-worth-history")
    investments_response = await async_client.get("/api/v1/investments/summary")
    loans_response = await async_client.get("/api/v1/loans/summary")
    historical_loans_response = await async_client.get(
        "/api/v1/loans/summary",
        params={"snapshot_date": "2026-03-11"},
    )

    assert snapshots_response.status_code == 200
    assert [item["snapshot_date"] for item in snapshots_response.json()["items"]] == [
        "2026-03-11",
        "2026-03-24",
        "2026-03-26",
        "2026-04-07",
    ]

    assert history_response.status_code == 200
    assert [item["snapshot_date"] for item in history_response.json()["items"]] == [
        "2026-03-11",
        "2026-03-24",
        "2026-03-26",
        "2026-04-07",
    ]

    assert investments_response.status_code == 200
    assert investments_response.json()["snapshot_date"] == "2026-04-07"
    assert len(investments_response.json()["items"]) == 11

    assert loans_response.status_code == 200
    assert loans_response.json()["snapshot_date"] == "2026-04-07"
    assert len(loans_response.json()["items"]) == 4

    assert historical_loans_response.status_code == 200
    assert historical_loans_response.json()["snapshot_date"] == "2026-03-11"
    assert len(historical_loans_response.json()["items"]) == 5
