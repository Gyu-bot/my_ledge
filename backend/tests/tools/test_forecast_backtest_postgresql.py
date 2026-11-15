"""Forecast backtest on real PostgreSQL created by ``alembic upgrade head``.

Set METRIC_TEST_DATABASE_URL (or REVIEW_TEST_DATABASE_URL) to a disposable
loopback server. A scratch database is created, migrated, and dropped.
"""

import asyncio
import json
import os
import subprocess
import sys
from collections.abc import AsyncIterator, Iterator
from pathlib import Path
from uuid import uuid4

import pytest
from sqlalchemy import func, select, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.models import AppSetting, Base, Transaction
from app.tools.forecast_backtest import (
    DATABASE_URL_ENV,
    BacktestConfig,
    BacktestError,
    read_only_session,
    run_backtest,
)
from forecast_backtest_ledger import PRIVATE_STRINGS, build_backtest_ledger

BACKEND_DIR = Path(__file__).resolve().parents[2]


@pytest.fixture(scope="module")
def migrated_url() -> Iterator[str]:
    admin_url = os.getenv("METRIC_TEST_DATABASE_URL") or os.getenv(
        "REVIEW_TEST_DATABASE_URL"
    )
    if not admin_url:
        pytest.skip("isolated PostgreSQL METRIC_TEST_DATABASE_URL not supplied")
    admin = make_url(admin_url)
    assert admin.host in ("localhost", "127.0.0.1", "::1")
    database = "forecast_backtest_" + uuid4().hex
    scratch_url = admin.set(database=database).render_as_string(hide_password=False)

    async def run(statement: str) -> None:
        engine = create_async_engine(admin_url, isolation_level="AUTOCOMMIT")
        async with engine.connect() as connection:
            await connection.execute(text(statement))
        await engine.dispose()

    asyncio.run(run(f'CREATE DATABASE "{database}"'))
    try:
        subprocess.run(
            [sys.executable, "-m", "alembic", "upgrade", "head"],
            cwd=BACKEND_DIR,
            env={**os.environ, "DATABASE_URL": scratch_url, "API_KEY": "test-api-key"},
            check=True,
            capture_output=True,
        )
        yield scratch_url
    finally:
        asyncio.run(run(f'DROP DATABASE IF EXISTS "{database}" WITH (FORCE)'))


@pytest.fixture
async def seeded_url(migrated_url: str) -> AsyncIterator[str]:
    engine = create_async_engine(migrated_url)
    tables = ", ".join(f'"{table.name}"' for table in Base.metadata.sorted_tables)
    async with engine.begin() as connection:
        await connection.execute(text(f"TRUNCATE {tables} RESTART IDENTITY CASCADE"))
    async with async_sessionmaker(engine, expire_on_commit=False)() as session:
        await build_backtest_ledger(session)
    await engine.dispose()
    yield migrated_url


async def _row_counts(url: str) -> tuple[int, int]:
    engine = create_async_engine(url)
    async with AsyncSession(engine) as session:
        counts = (
            await session.scalar(select(func.count()).select_from(Transaction)),
            await session.scalar(select(func.count()).select_from(AppSetting)),
        )
    await engine.dispose()
    return counts


async def test_read_only_backtest_matches_and_refuses_writes(seeded_url):
    before = await _row_counts(seeded_url)
    async with read_only_session(seeded_url) as session:
        assert (
            await session.execute(text("SHOW transaction_read_only"))
        ).scalar() == "on"
        assert (
            await session.execute(text("SHOW default_transaction_read_only"))
        ).scalar() == "on"
        assert (
            await session.execute(text("SHOW transaction_isolation"))
        ).scalar() == "repeatable read"
        report = await run_backtest(session, BacktestConfig())
        assert report["evaluated"]["months"] == 7
        net = report["accuracy"]["net"]["all"]
        assert net["exact"] == net["points"] == 35
        assert report["consistency"]["observed_mismatch_points"] == 0
        session.add(AppSetting(scope="x", key="y", value="z"))
        with pytest.raises(BacktestError):
            await session.flush()
        session.expunge_all()
        with pytest.raises(DBAPIError, match="read-only transaction"):
            await session.execute(
                text(
                    "INSERT INTO app_settings (scope, key, value) VALUES ('x', 'y', 'z')"
                )
            )
    assert await _row_counts(seeded_url) == before


def test_cli_end_to_end_on_postgresql(seeded_url):
    environment = {
        "PATH": os.environ.get("PATH", ""),
        "HOME": os.environ.get("HOME", ""),
        DATABASE_URL_ENV: seeded_url,
    }
    password = make_url(seeded_url).password or "unused-password-marker"
    outputs = {}
    for output_format in ("json", "markdown"):
        completed = subprocess.run(
            [
                sys.executable,
                "-m",
                "app.tools.forecast_backtest",
                "--format",
                output_format,
            ],
            cwd=BACKEND_DIR,
            env=environment,
            capture_output=True,
            text=True,
            check=False,
        )
        assert completed.returncode == 0, completed.stderr
        assert password not in completed.stdout + completed.stderr
        for private in PRIVATE_STRINGS:
            assert private not in completed.stdout
        outputs[output_format] = completed.stdout
    report = json.loads(outputs["json"])
    assert report["evaluated"]["points"] == 35
    assert report["accuracy"]["net"]["all"]["exact"] == 35
    assert "## (b) 관측된 약정의 재가산" in outputs["markdown"]
