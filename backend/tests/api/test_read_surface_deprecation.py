"""Approved read removal, with the remaining deprecation body unchanged."""

import sys
from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "services"))

from app.core.deprecation import DEPRECATED_READ_ENDPOINTS  # noqa: E402
from app.main import app  # noqa: E402
from read_surface_ledger import build_read_surface_ledger  # noqa: E402

REMOVED_READ_PATHS = (
    "/api/v1/analytics/discretionary-velocity",
    "/api/v1/analytics/purchase-gate-candidates",
    "/api/v1/analytics/spending-review-candidates",
    "/api/v1/analytics/spending-anomalies",
    "/api/v1/analytics/category-mom",
    "/api/v1/installments/forecast",
    "/api/v1/canonical-views/dashboard",
)


def test_openapi_marks_only_liquidity_deprecated_and_omits_removed_reads():
    schema = app.openapi()
    deprecated = {
        (method.upper(), path)
        for path, operations in schema["paths"].items()
        for method, operation in operations.items()
        if operation.get("deprecated")
    }
    assert (
        deprecated
        == set(DEPRECATED_READ_ENDPOINTS)
        == {("GET", "/api/v1/analytics/liquidity-health")}
    )
    assert all(path not in schema["paths"] for path in REMOVED_READ_PATHS)
    for (_, path), successor in DEPRECATED_READ_ENDPOINTS.items():
        assert successor in schema["paths"], (path, successor)
    # Review writes and import/schema contracts remain registered.
    assert (
        "patch"
        in schema["paths"][
            "/api/v1/analytics/purchase-gate-candidates/{candidate_key}/review"
        ]
    )
    assert "get" in schema["paths"]["/api/v1/schema"]


@pytest.mark.parametrize("path", REMOVED_READ_PATHS)
async def test_removed_reads_return_404_with_or_without_auth(
    async_client: AsyncClient, api_headers: dict[str, str], path: str
):
    for headers in ({}, api_headers):
        response = await async_client.get(path, headers=headers)
        assert response.status_code == 404
        assert "deprecation" not in response.headers


async def test_liquidity_keeps_body_byte_for_byte_and_adds_headers(
    async_client: AsyncClient, api_headers: dict[str, str], db_session: AsyncSession
):
    from fastapi import FastAPI
    from app.api.v1.router import api_router

    await build_read_surface_ledger(db_session)
    path = "/api/v1/analytics/liquidity-health"
    response = await async_client.get(path, headers=api_headers)
    assert response.status_code == 200
    assert response.headers["deprecation"] == "true"
    assert response.headers["link"] == (
        '</api/v1/metrics/net-worth/emergency-fund>; rel="successor-version"'
    )
    bare = FastAPI()
    bare.include_router(api_router)
    bare.dependency_overrides = app.dependency_overrides
    async with AsyncClient(
        transport=ASGITransport(app=bare), base_url="http://testserver"
    ) as raw:
        unwrapped = await raw.get(path, headers=api_headers)
    assert unwrapped.content == response.content
    assert "deprecation" not in unwrapped.headers
    for path in (
        "/api/v1/upload/logs",
        "/api/v1/upload/rollback-points",
        "/api/v1/read/commitments",
        "/api/v1/read/month-projection",
        "/api/v1/metrics/net-worth/emergency-fund",
    ):
        other = await async_client.get(path, headers=api_headers)
        assert "deprecation" not in other.headers, path


async def test_candidate_review_write_still_works_without_legacy_get(
    async_client: AsyncClient, api_headers: dict[str, str], db_session: AsyncSession
):
    from datetime import date, time
    from app.models.transaction import Transaction

    transaction = Transaction(
        date=date(2026, 7, 10),
        time=time(12),
        type="지출",
        amount=-100_000,
        merchant="synthetic-shop",
        description="synthetic-purchase",
        category_major="synthetic-category",
        currency="KRW",
    )
    db_session.add(transaction)
    await db_session.commit()
    path = f"/api/v1/analytics/purchase-gate-candidates/transaction:{transaction.id}/review"
    payload = {"review_status": "reviewed", "memo": "synthetic-review"}
    assert (await async_client.patch(path, json=payload)).status_code == 401
    response = await async_client.patch(path, headers=api_headers, json=payload)
    assert response.status_code == 200
    assert response.json()["candidate_key"] == f"transaction:{transaction.id}"
    assert response.json()["review_status"] == "reviewed"
    assert "deprecation" not in response.headers
