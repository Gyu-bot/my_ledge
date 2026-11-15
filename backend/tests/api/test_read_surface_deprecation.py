"""Deprecation marks on old reads the agent read surface replaces (T060)."""

import sys
from pathlib import Path

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "services"))

from app.core.deprecation import DEPRECATED_READ_ENDPOINTS  # noqa: E402
from app.main import app  # noqa: E402
from read_surface_ledger import build_read_surface_ledger  # noqa: E402

IMPORT_CONTRACT_PREFIXES = ("/api/v1/upload",)


@pytest.fixture
async def ledger(db_session: AsyncSession):
    return await build_read_surface_ledger(db_session)


def test_openapi_marks_only_the_listed_old_reads_deprecated():
    schema = app.openapi()
    deprecated = {
        (method.upper(), path)
        for path, operations in schema["paths"].items()
        for method, operation in operations.items()
        if operation.get("deprecated")
    }
    assert deprecated == set(DEPRECATED_READ_ENDPOINTS)
    assert not any(path.startswith(IMPORT_CONTRACT_PREFIXES) for _, path in deprecated)
    for (_, path), successor in DEPRECATED_READ_ENDPOINTS.items():
        assert successor in schema["paths"], (path, successor)


async def test_deprecated_reads_keep_body_and_add_headers(
    async_client: AsyncClient, api_headers: dict[str, str], ledger
):
    from fastapi import FastAPI
    from httpx import ASGITransport
    from httpx import AsyncClient as RawClient

    from app.api.v1.router import api_router

    response = await async_client.get(
        "/api/v1/installments/forecast", headers=api_headers
    )
    assert response.status_code == 200
    assert response.headers["deprecation"] == "true"
    assert response.headers["link"] == (
        '</api/v1/read/commitments>; rel="successor-version"'
    )
    # Same body as the route served by an app without the header middleware.
    bare = FastAPI()
    bare.include_router(api_router)
    bare.dependency_overrides = app.dependency_overrides
    async with RawClient(
        transport=ASGITransport(app=bare), base_url="http://testserver"
    ) as raw:
        unwrapped = await raw.get("/api/v1/installments/forecast", headers=api_headers)
    assert unwrapped.content == response.content
    assert "deprecation" not in unwrapped.headers
    for path in (
        "/api/v1/metrics/data-status",
        "/api/v1/upload/logs",
        "/api/v1/upload/rollback-points",
        "/api/v1/read/commitments",
    ):
        other = await async_client.get(path, headers=api_headers)
        assert "deprecation" not in other.headers, path
