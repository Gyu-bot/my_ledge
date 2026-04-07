from datetime import date

from httpx import AsyncClient
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.asset_snapshot import AssetSnapshot
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


async def test_asset_snapshot_compare_returns_default_latest_available_comparison(
    async_client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    db_session.add_all(
        [
            AssetSnapshot(
                snapshot_date=date(2026, 3, 31),
                side="asset",
                category="현금",
                product_name="asset-2026-03-31",
                amount="1000.00",
            ),
            AssetSnapshot(
                snapshot_date=date(2026, 3, 31),
                side="liability",
                category="부채",
                product_name="liability-2026-03-31",
                amount="200.00",
            ),
            AssetSnapshot(
                snapshot_date=date(2026, 4, 7),
                side="asset",
                category="현금",
                product_name="asset-2026-04-07",
                amount="1300.00",
            ),
            AssetSnapshot(
                snapshot_date=date(2026, 4, 7),
                side="liability",
                category="부채",
                product_name="liability-2026-04-07",
                amount="250.00",
            ),
        ]
    )
    await db_session.commit()

    response = await async_client.get("/api/v1/assets/snapshot-compare")

    assert response.status_code == 200
    assert response.json() == {
        "comparison_mode": "latest_available_vs_previous_available",
        "current": {
            "snapshot_date": "2026-04-07",
            "asset_total": "1300.00",
            "liability_total": "250.00",
            "net_worth": "1050.00",
        },
        "baseline": {
            "snapshot_date": "2026-03-31",
            "asset_total": "1000.00",
            "liability_total": "200.00",
            "net_worth": "800.00",
        },
        "delta": {
            "asset_total": "300.00",
            "liability_total": "50.00",
            "net_worth": "250.00",
            "asset_total_pct": 0.3,
            "liability_total_pct": 0.25,
            "net_worth_pct": 0.3125,
        },
        "comparison_days": 7,
        "is_partial": True,
        "is_stale": False,
        "can_compare": True,
        "comparison_label": "부분 기간",
    }


async def test_asset_snapshot_compare_supports_closed_month_mode(
    async_client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    await db_session.execute(delete(AssetSnapshot))
    db_session.add_all(
        [
            AssetSnapshot(
                snapshot_date=date(2026, 2, 28),
                side="asset",
                category="현금",
                product_name="asset-2026-02-28",
                amount="900.00",
            ),
            AssetSnapshot(
                snapshot_date=date(2026, 2, 28),
                side="liability",
                category="부채",
                product_name="liability-2026-02-28",
                amount="300.00",
            ),
            AssetSnapshot(
                snapshot_date=date(2026, 3, 31),
                side="asset",
                category="현금",
                product_name="asset-2026-03-31",
                amount="1000.00",
            ),
            AssetSnapshot(
                snapshot_date=date(2026, 3, 31),
                side="liability",
                category="부채",
                product_name="liability-2026-03-31",
                amount="200.00",
            ),
            AssetSnapshot(
                snapshot_date=date(2026, 4, 7),
                side="asset",
                category="현금",
                product_name="asset-2026-04-07",
                amount="1300.00",
            ),
            AssetSnapshot(
                snapshot_date=date(2026, 4, 7),
                side="liability",
                category="부채",
                product_name="liability-2026-04-07",
                amount="250.00",
            ),
        ]
    )
    await db_session.commit()

    response = await async_client.get(
        "/api/v1/assets/snapshot-compare",
        params={"comparison_mode": "last_closed_month_vs_previous_closed_month"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["comparison_mode"] == "last_closed_month_vs_previous_closed_month"
    assert payload["current"]["snapshot_date"] == "2026-03-31"
    assert payload["baseline"]["snapshot_date"] == "2026-02-28"
    assert payload["comparison_days"] == 31
    assert payload["is_partial"] is False
    assert payload["comparison_label"] == "마감월 기준"


async def test_asset_snapshot_compare_requires_exact_pair_dates(
    async_client: AsyncClient,
) -> None:
    response = await async_client.get(
        "/api/v1/assets/snapshot-compare",
        params={"comparison_mode": "selected_snapshot_vs_baseline_snapshot"},
    )

    assert response.status_code == 422


async def test_asset_snapshot_compare_smoke_on_real_workbook_chain(
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

    response = await async_client.get("/api/v1/assets/snapshot-compare")

    assert response.status_code == 200
    payload = response.json()
    assert payload["comparison_mode"] == "latest_available_vs_previous_available"
    assert payload["current"]["snapshot_date"] == "2026-04-07"
    assert payload["baseline"]["snapshot_date"] == "2026-03-26"
    assert payload["comparison_days"] == 12
    assert payload["can_compare"] is True
    assert payload["comparison_label"] == "부분 기간"
