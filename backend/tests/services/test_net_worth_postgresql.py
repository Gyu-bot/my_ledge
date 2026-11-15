"""T061 reconciliation on real PostgreSQL views created by ``alembic upgrade head``.

Set METRIC_TEST_DATABASE_URL (or REVIEW_TEST_DATABASE_URL) to a disposable
loopback server. A scratch database is created, migrated, and dropped.
"""

import asyncio
import os
import subprocess
import sys
from collections.abc import AsyncIterator, Iterator
from datetime import date
from decimal import Decimal
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
from app.models import Base
from app.models.asset_snapshot import AssetSnapshot
from net_worth_scenarios import D0, D1, D2, build_net_worth_scenario

BACKEND_DIR = Path(__file__).resolve().parents[2]
HEADERS = {"X-API-Key": "test-api-key"}


@pytest.fixture(scope="module")
def migrated_url() -> Iterator[str]:
    admin_url = os.getenv("METRIC_TEST_DATABASE_URL") or os.getenv(
        "REVIEW_TEST_DATABASE_URL"
    )
    if not admin_url:
        pytest.skip("isolated PostgreSQL METRIC_TEST_DATABASE_URL not supplied")
    admin = make_url(admin_url)
    assert admin.host in ("localhost", "127.0.0.1", "::1")
    database = "net_worth_" + uuid4().hex
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
async def pg_session(migrated_url: str) -> AsyncIterator[AsyncSession]:
    engine = create_async_engine(migrated_url)
    tables = ", ".join(f'"{table.name}"' for table in Base.metadata.sorted_tables)
    async with engine.begin() as connection:
        await connection.execute(text(f"TRUNCATE {tables} RESTART IDENTITY CASCADE"))
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as session:
        yield session
    await engine.dispose()


@pytest.fixture
async def pg_client(
    pg_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> AsyncIterator[AsyncClient]:
    monkeypatch.setenv("API_KEY", "test-api-key")
    get_settings.cache_clear()

    async def override() -> AsyncIterator[AsyncSession]:
        yield pg_session

    app.dependency_overrides[get_db_session] = override
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        yield client
    app.dependency_overrides.clear()


async def _view_values(session: AsyncSession, start: date, end: date) -> dict:
    """The reconciliation computed directly in SQL from the views."""

    async def scalar(sql: str, **params: object) -> int:
        value = (await session.execute(text(sql), params)).scalar_one()
        return int(Decimal(str(value)).quantize(Decimal(1)))

    nw = "SELECT asset_total - liability_total FROM vw_net_worth_snapshots WHERE snapshot_date = :d"
    kind = (
        "SELECT value_total FROM vw_snapshot_kind_totals "
        "WHERE kind = :k AND snapshot_date = :d"
    )
    lines = "FROM vw_metric_flow_lines WHERE date > :s AND date <= :e"
    residual = await scalar(
        "SELECT COALESCE(SUM(CASE WHEN type = '수입' THEN amount WHEN type = '지출' "
        f"THEN amount ELSE 0 END), 0) {lines}",
        s=start,
        e=end,
    )
    investment_net = await scalar(
        f"SELECT COALESCE(SUM(amount), 0) {lines} AND transfer_purpose = 'investment'",
        s=start,
        e=end,
    )
    undecided = await scalar(
        f"SELECT COALESCE(SUM(ABS(amount)), 0) {lines} AND transfer_purpose = 'undecided'",
        s=start,
        e=end,
    )
    change = await scalar(nw, d=end) - await scalar(nw, d=start)
    loan_decrease = await scalar(kind, k="loans", d=start) - await scalar(
        kind, k="loans", d=end
    )
    valuation = (
        await scalar(kind, k="investments", d=end)
        - await scalar(kind, k="investments", d=start)
        + investment_net
    )
    return {
        "net_worth_change": change,
        "residual": residual,
        "loan_balance_decrease": loan_decrease,
        "investment_valuation_change": valuation,
        "unexplained_difference": change - residual - loan_decrease - valuation,
        "undecided_activity_total": undecided,
    }


async def test_pg_reconciliation_api_equals_the_views(
    pg_client: AsyncClient, pg_session: AsyncSession
) -> None:
    await build_net_worth_scenario(pg_session)
    expected_items = {
        (D0, D1): (2_500_000, 1_880_000, 500_000, 150_000, -30_000, "complete"),
        (D1, D2): (
            1_780_000,
            1_399_999,
            500_000,
            -150_000,
            30_001,
            "incomplete_classification",
        ),
    }
    for (start, end), hand in expected_items.items():
        response = await pg_client.get(
            "/api/v1/metrics/net-worth/reconciliation",
            params={"start_date": start.isoformat(), "end_date": end.isoformat()},
            headers=HEADERS,
        )
        assert response.status_code == 200, response.text
        payload = response.json()
        view = await _view_values(pg_session, start, end)
        items = payload["items"]
        for key in (
            "net_worth_change",
            "residual",
            "loan_balance_decrease",
            "investment_valuation_change",
            "unexplained_difference",
        ):
            assert items[key] == view[key], (start, key)
        assert (
            payload["transfers"]["undecided_activity_total"]
            == view["undecided_activity_total"]
        )
        assert (
            items["net_worth_change"],
            items["residual"],
            items["loan_balance_decrease"],
            items["investment_valuation_change"],
            items["unexplained_difference"],
            payload["status"],
        ) == hand


async def test_pg_transfer_rules_and_monthly_split(
    pg_client: AsyncClient, pg_session: AsyncSession
) -> None:
    scenario = await build_net_worth_scenario(pg_session)
    rows = {
        row.transaction_id: (row.purpose, row.purpose_source)
        for row in (
            await pg_session.execute(
                text(
                    "SELECT transaction_id, purpose, purpose_source FROM vw_transfer_purpose"
                )
            )
        )
    }
    ids = scenario.ids
    assert rows[ids["feb_invest"]] == ("investment", "rule_merchant")
    assert rows[ids["feb_savings"]] == ("savings", "transaction")
    assert rows[ids["feb_move_out"]] == ("internal_move", "rule_category")
    assert rows[ids["feb_move_in"]] == ("internal_move", "rule_category")
    assert rows[ids["mar_unmarked"]] == ("undecided", "none")

    payload = (
        await pg_client.get("/api/v1/metrics/monthly-flow", headers=HEADERS)
    ).json()
    view_rows = {
        row["period"]: dict(row)
        for row in (
            await pg_session.execute(text("SELECT * FROM vw_monthly_flow_summary"))
        ).mappings()
    }
    for item in payload["items"]:
        for key, value in view_rows[item["period"]].items():
            assert item[key] == value, (item["period"], key)
        assert (
            sum(row["signed_amount"] for row in item["transfer_rows"])
            == item["transfer_net"]
        )
    february = next(item for item in payload["items"] if item["period"] == "2026-02")
    assert february["transfer_investment_savings_net"] == -1_300_000
    assert february["transfer_internal_move_net"] == 0


async def test_pg_cash_like_total_equals_canonical_view(
    pg_session: AsyncSession,
) -> None:
    day = date(2026, 5, 31)
    rows = [
        ("asset", "cat-x", "CMA-a", 100, None, None),
        ("asset", "cat-x", "통장-b", 200, None, None),
        ("asset", "현금-c", "item", 300, None, None),
        ("asset", "현금-c", "연금 item", 400, None, None),  # locked marker
        ("asset", "cat-y", "item-d", 500, True, None),
        ("asset", "cat-y", "item-e", 600, False, "immediate"),
        ("asset", "cat-y", "item-f", 700, None, "near_liquid"),
        ("asset", "예금-g", "item-g", -800, None, None),  # negative: excluded
        ("liability", "현금-h", "item-h", 900, None, None),
    ]
    pg_session.add_all(
        AssetSnapshot(
            snapshot_date=day,
            side=side,
            category=category,
            product_name=name,
            amount=Decimal(amount),
            is_cash_equivalent=flag,
            liquidity_tier=tier,
        )
        for side, category, name, amount, flag, tier in rows
    )
    await pg_session.commit()
    ours = (
        await pg_session.execute(
            text(
                "SELECT cash_like_total, cash_like_name_rule_total, net_worth "
                "FROM vw_net_worth_snapshots"
            )
        )
    ).one()
    canonical = (
        await pg_session.execute(
            text(
                "SELECT cash_equivalent_total, net_worth FROM vw_asset_snapshot_canonical"
            )
        )
    ).one()
    assert ours.cash_like_total == canonical.cash_equivalent_total == 1_700
    assert ours.cash_like_name_rule_total == 600
    assert ours.net_worth == canonical.net_worth


async def test_pg_emergency_fund(
    pg_client: AsyncClient, pg_session: AsyncSession
) -> None:
    await build_net_worth_scenario(pg_session)
    payload = (
        await pg_client.get("/api/v1/metrics/net-worth/emergency-fund", headers=HEADERS)
    ).json()
    assert payload["cash_like_total"] == 6_980_000
    assert payload["monthly_protected_outflow"] == 1_020_000
    assert payload["emergency_fund_months"] == round(6_980_000 / 1_020_000, 2)
    protected = (
        await pg_session.execute(
            text(
                "SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY protected_spend) "
                "FROM vw_monthly_flow_summary WHERE period <= '2026-03'"
            )
        )
    ).scalar_one()
    assert payload["monthly_protected_outflow"] == int(protected)
