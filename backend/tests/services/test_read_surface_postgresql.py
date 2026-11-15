"""Agent read surface on real PostgreSQL (T060), realistic-size synthetic ledger.

Set METRIC_TEST_DATABASE_URL (or REVIEW_TEST_DATABASE_URL) to a disposable
loopback server. A scratch database is created, migrated with
``alembic upgrade head``, seeded with ~4,000 synthetic transactions over 20
months, and dropped afterwards.
"""

import asyncio
import os
import subprocess
import sys
from collections.abc import AsyncIterator, Iterator
from pathlib import Path
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import get_settings
from app.core.database import get_db_session
from app.main import app
from read_surface_ledger import build_read_surface_ledger
from read_surface_scenarios import HEADERS, answer_questions

BACKEND_DIR = Path(__file__).resolve().parents[2]
READ_SIZE_PATHS = [
    ("/api/v1/read/index", {}),
    ("/api/v1/read/data-status", {}),
    ("/api/v1/read/monthly-flow", {}),
    ("/api/v1/read/spend-cube", {}),
    ("/api/v1/read/comparison/monthly-flow", {}),
    ("/api/v1/read/comparison/contributions", {}),
    ("/api/v1/read/review-items", {}),
    ("/api/v1/read/commitments", {}),
]


@pytest.fixture(scope="module")
def migrated_url() -> Iterator[str]:
    admin_url = os.getenv("METRIC_TEST_DATABASE_URL") or os.getenv(
        "REVIEW_TEST_DATABASE_URL"
    )
    if not admin_url:
        pytest.skip("isolated PostgreSQL METRIC_TEST_DATABASE_URL not supplied")
    admin = make_url(admin_url)
    assert admin.host in ("localhost", "127.0.0.1", "::1")
    database = "read_surface_" + uuid4().hex
    scratch_url = admin.set(database=database).render_as_string(hide_password=False)

    async def run(statement: str) -> None:
        engine = create_async_engine(admin_url, isolation_level="AUTOCOMMIT")
        async with engine.connect() as connection:
            await connection.execute(text(statement))
        await engine.dispose()

    asyncio.run(run(f'CREATE DATABASE "{database}"'))
    try:
        environment = {
            **os.environ,
            "DATABASE_URL": scratch_url,
            "API_KEY": "test-api-key",
        }
        subprocess.run(
            [sys.executable, "-m", "alembic", "upgrade", "head"],
            cwd=BACKEND_DIR,
            env=environment,
            check=True,
            capture_output=True,
        )
        yield scratch_url
    finally:
        asyncio.run(run(f'DROP DATABASE IF EXISTS "{database}" WITH (FORCE)'))


@pytest.fixture
async def pg_client(
    migrated_url: str, monkeypatch: pytest.MonkeyPatch
) -> AsyncIterator[AsyncClient]:
    engine = create_async_engine(migrated_url)
    factory = async_sessionmaker(
        bind=engine, class_=AsyncSession, expire_on_commit=False
    )
    async with factory() as session:
        await build_read_surface_ledger(session, purchases_per_month=205)
    monkeypatch.setenv("API_KEY", "test-api-key")
    get_settings.cache_clear()

    async def override() -> AsyncIterator[AsyncSession]:
        async with factory() as session:
            yield session

    app.dependency_overrides[get_db_session] = override
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        yield client
    app.dependency_overrides.clear()
    async with engine.begin() as connection:
        tables = (
            await connection.execute(
                text(
                    "SELECT string_agg(quote_ident(tablename), ', ') FROM pg_tables "
                    "WHERE schemaname = 'public' AND tablename <> 'alembic_version'"
                )
            )
        ).scalar_one()
        await connection.execute(text(f"TRUNCATE {tables} RESTART IDENTITY CASCADE"))
    await engine.dispose()


async def test_q1_to_q6_on_postgresql_without_raw_transactions(pg_client: AsyncClient):
    log = await answer_questions(pg_client)
    assert len(log.paths) <= 16


async def test_read_surface_is_small_next_to_dashboard_and_raw_listing(
    pg_client: AsyncClient,
):
    sizes = {}
    for path, params in READ_SIZE_PATHS:
        response = await pg_client.get(path, params=params, headers=HEADERS)
        assert response.status_code == 200, (path, response.text)
        sizes[path] = len(response.content)
    dashboard = await pg_client.get(
        "/api/v1/canonical-views/dashboard",
        params={"months": 24, "merchant_limit": 50, "queue_limit": 100},
        headers=HEADERS,
    )
    assert dashboard.status_code == 200
    raw_total, page = 0, 1
    while True:
        response = await pg_client.get(
            "/api/v1/transactions",
            params={"per_page": 200, "page": page},
            headers=HEADERS,
        )
        raw_total += len(response.content)
        if page * 200 >= response.json()["total"]:
            break
        page += 1
    assert response.json()["total"] > 3_900
    for path, size in sizes.items():
        assert size < len(dashboard.content), (path, size, len(dashboard.content))
    assert sum(sizes.values()) < raw_total / 10, (sizes, raw_total)
    print({"read": sizes, "dashboard_24m": len(dashboard.content), "raw": raw_total})


async def test_read_surface_matches_screen_endpoints_on_postgresql(
    pg_client: AsyncClient,
):
    screen = (
        await pg_client.get("/api/v1/metrics/monthly-flow", headers=HEADERS)
    ).json()
    read = (await pg_client.get("/api/v1/read/monthly-flow", headers=HEADERS)).json()
    assert read["data"]["items"] == screen["items"]
    commitments = (
        await pg_client.get("/api/v1/read/commitments", headers=HEADERS)
    ).json()
    closed = {item["period"]: item for item in screen["items"]}[
        commitments["data"]["period"]
    ]
    assert (
        commitments["data"]["totals"]["observed_committed_total"]
        == (closed["committed_total"])
    )
    assert (
        sum(
            item["observation"]["observed_amount"]
            for item in commitments["data"]["items"]
        )
        == closed["committed_total"]
    )
