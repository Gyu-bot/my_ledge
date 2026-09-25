from datetime import date
from decimal import Decimal

from app.models import AssetSnapshot, Investment


async def test_policy_preview_confirmation_auth_and_coverage(
    async_client, db_session, api_headers
):
    db_session.add(
        Investment(
            snapshot_date=date(2026, 1, 1),
            broker="토스증권",
            product_name="주식",
            market_value=Decimal("100"),
        )
    )
    db_session.add(
        AssetSnapshot(
            snapshot_date=date(2026, 1, 1),
            side="asset",
            category="투자",
            product_name="계좌",
            amount=Decimal("100"),
        )
    )
    await db_session.commit()
    response = await async_client.get("/api/v1/assets/source-policy")
    assert response.status_code == 200
    assert response.json()["investment_source"] == "banksalad_snapshot"
    policy = {"investment_source": "toss_securities_api"}
    assert (
        await async_client.post(
            "/api/v1/assets/source-policy/preview", json={"policy": policy}
        )
    ).status_code == 401
    preview = await async_client.post(
        "/api/v1/assets/source-policy/preview",
        json={"policy": policy},
        headers=api_headers,
    )
    assert preview.status_code == 200
    assert preview.json()["historical_snapshots_mutated"] is False
    request = {
        "policy": policy,
        "confirmed": True,
        "preview_token": preview.json()["preview_token"],
    }
    assert (
        await async_client.patch("/api/v1/assets/source-policy", json=request)
    ).status_code == 401
    assert (
        await async_client.patch(
            "/api/v1/assets/source-policy",
            json={**request, "confirmed": False},
            headers=api_headers,
        )
    ).status_code == 422
    applied = await async_client.patch(
        "/api/v1/assets/source-policy", json=request, headers=api_headers
    )
    assert applied.status_code == 200
    assert applied.json()["revision"] == 1
    coverage = await async_client.get("/api/v1/assets/source-coverage")
    assert coverage.status_code == 200
    assert (
        coverage.json()["accounts"][0]["fallback_reason"] == "account_mapping_required"
    )
    assert coverage.json()["accounts"][0]["account_scope"] == "broker_group"
    assert (
        await async_client.get("/api/v1/assets/source-account-mappings")
    ).json() == []
    assert (
        await async_client.post("/api/v1/assets/source-account-mappings", json={})
    ).status_code == 401
    legacy = await async_client.get(
        "/api/v1/investments/summary?snapshot_date=2026-01-01"
    )
    assert legacy.json()["totals"]["market_value"] == "100.00"
