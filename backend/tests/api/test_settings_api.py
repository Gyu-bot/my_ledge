from datetime import date, time

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.transaction import Transaction


async def test_get_analytics_settings_requires_api_key(
    async_client: AsyncClient,
) -> None:
    response = await async_client.get("/api/v1/settings/analytics")

    assert response.status_code == 401


async def test_get_and_patch_analytics_settings_returns_defaults_saved_and_effective_values(
    async_client: AsyncClient,
    api_headers: dict[str, str],
) -> None:
    initial = await async_client.get("/api/v1/settings/analytics", headers=api_headers)

    assert initial.status_code == 200
    assert initial.json() == {
        "defaults": {
            "spending_anomalies": {
                "min_delta_amount": 100000,
                "anomaly_threshold": 0.5,
                "baseline_months": 3,
            },
        },
        "saved": {
            "spending_anomalies": {
                "min_delta_amount": None,
                "anomaly_threshold": None,
                "baseline_months": None,
            },
        },
        "effective": {
            "spending_anomalies": {
                "min_delta_amount": 100000,
                "anomaly_threshold": 0.5,
                "baseline_months": 3,
            },
        },
    }

    patched = await async_client.patch(
        "/api/v1/settings/analytics",
        headers=api_headers,
        json={
            "spending_anomalies": {
                "min_delta_amount": 30000,
                "anomaly_threshold": 1.25,
            },
        },
    )

    assert patched.status_code == 200
    payload = patched.json()
    assert payload["saved"]["spending_anomalies"] == {
        "min_delta_amount": 30000,
        "anomaly_threshold": 1.25,
        "baseline_months": None,
    }
    assert payload["effective"]["spending_anomalies"] == {
        "min_delta_amount": 30000,
        "anomaly_threshold": 1.25,
        "baseline_months": 3,
    }


async def test_patch_analytics_settings_validates_ranges(
    async_client: AsyncClient,
    api_headers: dict[str, str],
) -> None:
    response = await async_client.patch(
        "/api/v1/settings/analytics",
        headers=api_headers,
        json={"spending_anomalies": {"baseline_months": 13}},
    )

    assert response.status_code == 422


async def test_saved_analytics_settings_drive_spending_anomalies_defaults(
    async_client: AsyncClient,
    api_headers: dict[str, str],
    db_session: AsyncSession,
) -> None:
    await _seed_anomaly_transactions(db_session)
    await async_client.patch(
        "/api/v1/settings/analytics",
        headers=api_headers,
        json={"spending_anomalies": {"min_delta_amount": 30000}},
    )

    default_response = await async_client.get(
        "/api/v1/analytics/spending-anomalies",
        params={"end_date": "2026-04-30"},
    )
    override_response = await async_client.get(
        "/api/v1/analytics/spending-anomalies",
        params={"end_date": "2026-04-30", "min_delta_amount": 100000},
    )

    assert default_response.status_code == 200
    assert override_response.status_code == 200
    default_payload = default_response.json()
    override_payload = override_response.json()
    assert default_payload["total"] == 1
    assert "min_delta_amount=30000" in default_payload["assumptions"]
    assert override_payload["total"] == 0
    assert "min_delta_amount=100000" in override_payload["assumptions"]


async def _seed_anomaly_transactions(db_session: AsyncSession) -> None:
    rows = [
        ("2026-01-10", -100000),
        ("2026-02-10", -100000),
        ("2026-03-10", -100000),
        ("2026-04-10", -150000),
    ]
    for index, (tx_date, amount) in enumerate(rows, start=1):
        db_session.add(
            Transaction(
                date=date.fromisoformat(tx_date),
                time=time(12, index),
                type="지출",
                category_major="식비",
                category_minor="외식",
                description=f"merchant-{index}",
                merchant=f"merchant-{index}",
                amount=amount,
                currency="KRW",
                payment_method="카드",
                source="import",
            )
        )
    await db_session.commit()
