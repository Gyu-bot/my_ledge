"""Views-only T056 retirement preserves canonical responses and retained values."""

import asyncio
import json
import sys
from pathlib import Path

from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.database import get_db_session
from app.main import app

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "services"))
from read_surface_ledger import build_read_surface_ledger  # noqa: E402
from test_nature_axes_migration_postgresql import _alembic, scratch_url as scratch_url

BEFORE = "20261117_0040"
RETIRE = "20261117_0041"


def normalize(value):
    if isinstance(value, dict):
        return {k: normalize(v) for k, v in value.items() if k != "generated_at"}
    if isinstance(value, list):
        return [normalize(v) for v in value]
    return value


async def capture(url):
    engine = create_async_engine(url, connect_args={"server_settings": {"jit": "off"}})
    factory = async_sessionmaker(engine, expire_on_commit=False)

    async def override():
        async with factory() as db:
            yield db

    app.dependency_overrides[get_db_session] = override
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://testserver"
        ) as client:
            paths = sorted(
                r.path
                for r in app.routes
                if hasattr(r, "methods")
                and "GET" in r.methods
                and r.path.startswith(("/api/v1/read/", "/api/v1/metrics/"))
                and "{" not in r.path
            )
            bodies = {}
            for path in paths:
                response = await client.get(path, headers={"X-API-Key": "test-api-key"})
                assert response.status_code == 200, (path, response.text)
                bodies[path] = normalize(response.json())
        async with engine.connect() as db:
            definitions = dict(
                (
                    await db.execute(
                        text(
                            "SELECT viewname, definition FROM pg_views WHERE schemaname='public'"
                        )
                    )
                ).all()
            )
            rows = {
                name: [
                    dict(r)
                    for r in (
                        await db.execute(text(f'SELECT * FROM "{name}"'))
                    ).mappings()
                ]
                for name in definitions
            }
            transactions = [
                dict(r)
                for r in (
                    await db.execute(text("SELECT * FROM transactions ORDER BY id"))
                ).mappings()
            ]
        rows = {
            name: sorted(
                items, key=lambda row: json.dumps(row, sort_keys=True, default=str)
            )
            for name, items in rows.items()
        }
        return bodies, definitions, rows, transactions
    finally:
        app.dependency_overrides.pop(get_db_session, None)
        await engine.dispose()


def test_views_roundtrip_and_read_values_are_identical(scratch_url):
    _alembic(scratch_url, "upgrade", BEFORE)

    async def seed():
        engine = create_async_engine(scratch_url)
        try:
            async with async_sessionmaker(engine, expire_on_commit=False)() as db:
                await build_read_surface_ledger(db, purchases_per_month=8)
        finally:
            await engine.dispose()

    asyncio.run(seed())
    before = asyncio.run(capture(scratch_url))
    _alembic(scratch_url, "upgrade", RETIRE)
    after = asyncio.run(capture(scratch_url))
    assert after[0] == before[0]  # every read/*, monthly flow, cube and comparison
    assert after[3] == before[3]  # no table writes at all
    assert "vw_recurring_merchant_monthly" not in after[1]
    for name, rows in after[2].items():
        if not rows:
            assert before[2][name] == []
            continue
        keys = set(rows[0]) & set(before[2][name][0])

        def ordered(items):
            return sorted(
                json.dumps({k: r[k] for k in keys}, sort_keys=True, default=str)
                for r in items
            )

        assert ordered(rows) == ordered(before[2][name]), name
    _alembic(scratch_url, "downgrade", BEFORE)
    restored = asyncio.run(capture(scratch_url))
    assert restored[1:] == before[1:]
    _alembic(scratch_url, "upgrade", RETIRE)
    assert asyncio.run(capture(scratch_url))[0] == before[0]
