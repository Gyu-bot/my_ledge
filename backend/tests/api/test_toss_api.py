from datetime import datetime, timezone
from unittest.mock import AsyncMock

import pytest
from sqlalchemy import func, select

from app.core.config import get_settings
from app.models.asset_source import AssetSourceRun
from app.schemas.asset_source import ExternalRunInput
from app.services import toss_service


@pytest.fixture(autouse=True)
def isolated_toss_settings(monkeypatch):
    monkeypatch.setenv("TOSS_CLIENT_ID", "")
    monkeypatch.setenv("TOSS_CLIENT_SECRET", "")
    get_settings.cache_clear()


async def test_public_status_exposes_only_configuration_and_attempt_metadata(
    async_client,
):
    response = await async_client.get("/api/v1/integrations/toss/status")
    assert response.status_code == 200
    assert response.json() == {
        "configured": False,
        "last_attempt": None,
        "mapping_connected": False,
        "cooldown_seconds": 0,
    }


async def test_sync_requires_api_key_before_any_provider_call(
    async_client, db_session, monkeypatch
):
    collect = AsyncMock()
    monkeypatch.setattr(toss_service.toss_client, "collect", collect)
    for headers in ({}, {"X-API-Key": "wrong"}):
        response = await async_client.post(
            "/api/v1/integrations/toss/sync", json={}, headers=headers
        )
        assert response.status_code == 401
    collect.assert_not_awaited()
    assert await db_session.scalar(select(func.count(AssetSourceRun.id))) == 0


async def test_missing_config_and_no_client_supplied_credentials(
    async_client, api_headers, monkeypatch
):
    collect = AsyncMock()
    monkeypatch.setattr(toss_service.toss_client, "collect", collect)
    response = await async_client.post(
        "/api/v1/integrations/toss/sync", json={}, headers=api_headers
    )
    assert (
        response.status_code == 503
        and response.json()["detail"] == "credentials_not_configured"
    )
    response = await async_client.post(
        "/api/v1/integrations/toss/sync",
        json={"client_secret": "unaccepted"},
        headers=api_headers,
    )
    assert response.status_code == 422
    collect.assert_not_awaited()


async def test_success_status_and_cooldown_http_contract(
    async_client, api_headers, monkeypatch
):
    monkeypatch.setenv("TOSS_CLIENT_ID", "synthetic-id")
    monkeypatch.setenv("TOSS_CLIENT_SECRET", "synthetic-secret")
    get_settings.cache_clear()
    now = datetime.now(timezone.utc)
    collect = AsyncMock(
        return_value=ExternalRunInput(
            account_key="toss:account:synthetic",
            valuation_at=now,
            observed_at=now,
            status="success_complete",
            holdings=[],
        )
    )
    monkeypatch.setattr(toss_service.toss_client, "collect", collect)
    response = await async_client.post(
        "/api/v1/integrations/toss/sync", json={}, headers=api_headers
    )
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "success_complete" and body["holdings_count"] == 0
    assert not body["mapping_connected"] and body["error_code"] is None
    status = await async_client.get("/api/v1/integrations/toss/status")
    assert status.json()["configured"]
    for field in ("observed_at", "ingested_at"):
        timestamp = datetime.fromisoformat(status.json()["last_attempt"][field])
        assert timestamp.tzinfo is not None
    assert datetime.fromisoformat(status.json()["last_attempt"]["observed_at"]) == now
    assert status.json()["last_attempt"]["run_id"] == body["run_id"]
    assert 0 < status.json()["cooldown_seconds"] <= 60
    for private in ("synthetic-id", "synthetic-secret", "toss:account:synthetic"):
        assert private not in status.text and private not in response.text
    blocked = await async_client.post(
        "/api/v1/integrations/toss/sync", json={}, headers=api_headers
    )
    assert blocked.status_code == 409 and blocked.json()["detail"] == "sync_cooldown"
    assert collect.await_count == 1
