"""Metric views on real PostgreSQL, created by ``alembic upgrade head``.

Set METRIC_TEST_DATABASE_URL (or REVIEW_TEST_DATABASE_URL) to a disposable
loopback server, e.g. ``postgresql+asyncpg://user:pass@127.0.0.1:55432/db``.
A scratch database is created, migrated, and dropped for this module.
"""

import asyncio
import os
import subprocess
import sys
from collections import defaultdict
from collections.abc import AsyncIterator, Iterator
from pathlib import Path
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select, text
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import get_settings
from app.core.database import get_db_session
from app.main import app
from app.models import Base
from app.services.metric_views import (
    FLOW_LINES_VIEW,
    MONTHLY_FLOW_SUMMARY_VIEW,
    SPEND_CUBE_VIEW,
)
from app.services.monthly_projection_service import get_monthly_projection
from metric_synthetic_ledger import (
    AS_OF,
    assert_flow_invariants,
    build_synthetic_ledger,
)
import test_amount_conservation as t055
import test_metric_flow_invariants as invariants
import test_transaction_flow_filters as flow_filters

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
    database = "metric_views_" + uuid4().hex
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
async def pg_session(migrated_url: str) -> AsyncIterator[AsyncSession]:
    engine = create_async_engine(migrated_url)
    tables = ", ".join(f'"{table.name}"' for table in Base.metadata.sorted_tables)
    async with engine.begin() as connection:
        await connection.execute(text(f"TRUNCATE {tables} RESTART IDENTITY CASCADE"))
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    async with session_factory() as session:
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


HEADERS = {"X-API-Key": "test-api-key"}


async def _summary(session: AsyncSession) -> dict[str, dict]:
    return {
        row["period"]: dict(row)
        for row in (await session.execute(select(MONTHLY_FLOW_SUMMARY_VIEW))).mappings()
    }


async def test_pg_flow_rows_sum_to_effective_transactions(
    pg_session: AsyncSession,
) -> None:
    ledger = await build_synthetic_ledger(pg_session)
    await assert_flow_invariants(pg_session, ledger)


async def test_pg_flow_summary_matches_hand_computed_months(
    pg_session: AsyncSession,
) -> None:
    await invariants.test_flow_summary_matches_hand_computed_months(pg_session)


async def test_pg_metric_and_analytics_api_equal_the_views(
    pg_session: AsyncSession, pg_client: AsyncClient
) -> None:
    await build_synthetic_ledger(pg_session)
    summary = await _summary(pg_session)

    flow = (await pg_client.get("/api/v1/metrics/monthly-flow", headers=HEADERS)).json()
    assert [item["period"] for item in flow["items"]] == sorted(summary)
    for item in flow["items"]:
        for key, value in summary[item["period"]].items():
            assert item[key] == value, (item["period"], key)

    cashflow = (await pg_client.get("/api/v1/analytics/monthly-cashflow")).json()
    assert {
        item["period"]: (
            item["income"],
            item["expense"],
            item["transfer"],
            item["net_cashflow"],
        )
        for item in cashflow["items"]
    } == {
        period: (
            row["income_total"],
            row["total_outflow"],
            row["transfer_activity_total"],
            row["residual"],
        )
        for period, row in summary.items()
    }

    for path in ("fixed-cost-trend", "fixed-cost-summary", "recurring-payments"):
        assert (await pg_client.get(f"/api/v1/analytics/{path}")).status_code == 404

    income = (
        await pg_client.get(
            "/api/v1/analytics/income-stability", params={"end_date": "2026-02-28"}
        )
    ).json()
    assert {item["period"]: item["income"] for item in income["items"]} == {
        period: row["income_total"]
        for period, row in summary.items()
        if period <= "2026-02" and row["income_total"]
    }

    cube_by_category: dict[str, int] = defaultdict(int)
    cube_by_merchant: dict[str, int] = defaultdict(int)
    for row in (
        await pg_session.execute(
            select(SPEND_CUBE_VIEW).where(SPEND_CUBE_VIEW.c.period == "2026-02")
        )
    ).mappings():
        cube_by_category[row["effective_category_major"]] += int(row["amount"])
        cube_by_merchant[row["merchant"]] += int(row["amount"])

    category = (
        await pg_client.get(
            "/api/v1/metrics/comparison/contributions",
            params={"period": "2026-02"},
            headers=HEADERS,
        )
    ).json()
    assert {
        item["category"]: item["target_amount"]
        for item in category["items"]
        if item["target_amount"] or item["category"] in cube_by_category
    } == dict(cube_by_category)

    merchants = (
        await pg_client.get(
            "/api/v1/analytics/merchant-spend",
            params={
                "start_date": "2026-02-01",
                "end_date": "2026-02-28",
                "limit": 200,
            },
        )
    ).json()
    assert {item["merchant"]: item["amount"] for item in merchants["items"]} == dict(
        cube_by_merchant
    )

    methods = (
        await pg_client.get(
            "/api/v1/analytics/payment-method-patterns",
            params={"start_date": "2026-02-01", "end_date": "2026-02-28"},
        )
    ).json()
    assert (
        sum(item["total_amount"] for item in methods["items"])
        == summary["2026-02"]["total_outflow"]
    )

    cube_api = (
        await pg_client.get(
            "/api/v1/metrics/spend-cube",
            params={
                "start_period": "2026-02",
                "end_period": "2026-02",
                "group_by": "effective_category_major",
            },
            headers=HEADERS,
        )
    ).json()
    assert {
        row["effective_category_major"]: row["amount"] for row in cube_api["rows"]
    } == dict(cube_by_category)
    assert cube_api["total_amount"] == summary["2026-02"]["total_outflow"]

    projection = await get_monthly_projection(pg_session, reference_date=AS_OF)
    assert projection.observed_net_expense == summary["2026-03"]["total_outflow"]
    assert projection.observed_income == summary["2026-03"]["income_total"]


async def test_pg_legacy_views_and_read_surface_equal_the_flow(
    pg_session: AsyncSession, pg_client: AsyncClient
) -> None:
    await build_synthetic_ledger(pg_session)
    summary = await _summary(pg_session)

    async def rows(sql: str) -> list[dict]:
        return [dict(row) for row in (await pg_session.execute(text(sql))).mappings()]

    for row in await rows("SELECT * FROM vw_monthly_cashflow"):
        flow = summary[row["period"]]
        assert row["income_total"] == flow["income_total"]
        assert row["expense_total"] == flow["total_outflow"]
        assert row["loan_repayment_total"] == flow["committed_loan_total"]
        assert row["non_loan_expense_total"] == flow["living_spend"]
        assert row["transfer_activity_total"] == flow["transfer_activity_total"]
        assert row["net_cashflow"] == flow["residual"]
    for row in await rows("SELECT * FROM vw_fixed_cost_monthly_summary"):
        assert row["expense_total"] == summary[row["period"]]["living_spend"]
    category_spend: dict[str, int] = defaultdict(int)
    for row in await rows("SELECT * FROM vw_category_monthly_spend"):
        category_spend[row["period"]] += row["amount"]
    assert dict(category_spend) == {
        period: -row["total_outflow"] for period, row in summary.items()
    }
    income_by_category: dict[str, int] = defaultdict(int)
    for row in await rows("SELECT * FROM vw_income_monthly_by_category"):
        income_by_category[row["period"]] += row["income_total"]
    assert dict(income_by_category) == {
        period: row["income_total"]
        for period, row in summary.items()
        if row["income_total"]
    }
    loan_by_period: dict[str, int] = defaultdict(int)
    for row in await rows("SELECT * FROM vw_loan_repayment_monthly"):
        loan_by_period[row["period"]] += row["repayment_total"]
    assert dict(loan_by_period) == {
        period: row["committed_loan_total"]
        for period, row in summary.items()
        if row["committed_loan_total"]
    }

    dashboard = (
        await pg_client.get(
            "/api/v1/read/monthly-flow",
            headers=HEADERS,
        )
    ).json()
    assert {
        item["period"]: item["total_outflow"] for item in dashboard["data"]["items"]
    } == {period: row["total_outflow"] for period, row in summary.items()}
    assert dashboard["as_of"]["transaction_as_of"] == AS_OF.isoformat()
    assert dashboard["as_of"]["last_closed_period"] == "2026-02"


async def test_pg_flow_lines_have_no_duplicate_single_lines(
    pg_session: AsyncSession,
) -> None:
    await build_synthetic_ledger(pg_session)
    lines = FLOW_LINES_VIEW
    duplicates = (
        await pg_session.execute(
            select(lines.c.transaction_id, lines.c.attributed_transaction_id)
            .group_by(lines.c.transaction_id, lines.c.attributed_transaction_id)
            .having(func.count() > 1)
        )
    ).all()
    assert duplicates == []


# T055 defect scenarios, re-run against the migration-created views.
async def test_pg_f01_approved_replacement_counts_once(pg_session) -> None:
    await t055.test_f01_approved_replacement_counts_once(pg_session)


async def test_pg_f02_partial_refund_allocation_preserves_signed_net(
    pg_session,
) -> None:
    await t055.test_f02_partial_refund_allocation_preserves_signed_net(pg_session)


async def test_pg_f02_multiple_refund_allocation_preserves_signed_net(
    pg_session,
) -> None:
    await t055.test_f02_multiple_refund_allocation_preserves_signed_net(pg_session)


async def test_pg_f03_month_boundary_refund_stays_in_posting_month(
    pg_session,
) -> None:
    await t055.test_f03_month_boundary_refund_stays_in_posting_month(pg_session)


async def test_pg_f04_non_krw_amounts_are_not_summed_with_krw(pg_session) -> None:
    await t055.test_f04_non_krw_amounts_are_not_summed_with_krw(pg_session)


async def test_pg_transaction_flow_filters_match_the_flow_lines(
    pg_session: AsyncSession, pg_client: AsyncClient
) -> None:
    """T059: the transactions listing's line filters read the PostgreSQL view."""
    await build_synthetic_ledger(pg_session)
    await flow_filters.assert_listing_matches_flow_lines(pg_client, pg_session)


async def test_pg_remaining_actuals_equal_views(pg_session):
    from test_remaining_metric_criteria import scenario_remaining_actuals_equal_views

    await scenario_remaining_actuals_equal_views(pg_session)


async def test_pg_review_comparison(pg_session):
    from test_remaining_metric_criteria import scenario_review_comparison

    await scenario_review_comparison(pg_session)


async def test_pg_expense_aliases_and_view_ratios(pg_session, pg_client):
    await build_synthetic_ledger(pg_session)
    # Add income in the month in progress so the old view would produce a rate.
    from datetime import time
    from app.models.transaction import Transaction

    pg_session.add(
        Transaction(
            date=AS_OF,
            time=time(12),
            type="수입",
            amount=100_000,
            description="synthetic-income",
            merchant="synthetic-income",
            category_major="synthetic-category",
            currency="KRW",
        )
    )
    await pg_session.commit()
    for row in (
        await pg_session.execute(text("SELECT * FROM vw_monthly_cashflow"))
    ).mappings():
        assert row["total_outflow"] == row["expense_total"]
        assert row["living_spend"] == row["non_loan_expense_total"]
        if row["period"] == "2026-03":
            assert row["savings_rate"] is None
        elif row["income_total"]:
            assert float(row["savings_rate"]) == round(
                row["net_cashflow"] / row["income_total"], 4
            )
    for row in (
        await pg_session.execute(text("SELECT * FROM vw_fixed_cost_monthly_summary"))
    ).mappings():
        assert row["living_spend"] == row["expense_total"]
    for path in ("fixed-cost-summary", "fixed-cost-trend"):
        assert (await pg_client.get(f"/api/v1/analytics/{path}")).status_code == 404


async def test_pg_remaining_view_migration_roundtrip(pg_session, migrated_url):
    """Only savings_rate may change; aliases are additive; downgrade is exact."""
    await build_synthetic_ledger(pg_session)
    from datetime import time
    from app.models.transaction import Transaction

    pg_session.add(
        Transaction(
            date=AS_OF,
            time=time(12),
            type="수입",
            amount=100_000,
            description="synthetic-income",
            merchant="synthetic-income",
            category_major="synthetic-category",
            currency="KRW",
        )
    )
    await pg_session.commit()

    async def snapshot():
        result = {}
        # A new connection avoids stale asyncpg SELECT * plans after changing
        # the view columns in a separate Alembic process.
        engine = create_async_engine(migrated_url)
        async with engine.connect() as connection:
            for view in (
                "vw_monthly_cashflow",
                "vw_fixed_cost_monthly_summary",
                "transactions",
            ):
                result[view] = [
                    dict(row)
                    for row in (
                        await connection.execute(text(f"SELECT * FROM {view}"))
                    ).mappings()
                ]
        await engine.dispose()
        return result

    async def migrate(direction, target):
        process = await asyncio.create_subprocess_exec(
            sys.executable,
            "-m",
            "alembic",
            direction,
            target,
            cwd=BACKEND_DIR,
            env={**os.environ, "DATABASE_URL": migrated_url, "API_KEY": "test-api-key"},
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        _, stderr = await process.communicate()
        assert process.returncode == 0, stderr.decode()

    await migrate("downgrade", "20261117_0040")
    upgraded = await snapshot()
    await migrate("downgrade", "20261116_0039")
    original = await snapshot()
    await migrate("upgrade", "20261117_0040")
    again = await snapshot()
    assert sorted(upgraded["transactions"], key=lambda r: r["id"]) == sorted(
        original["transactions"], key=lambda r: r["id"]
    )
    assert sorted(again["transactions"], key=lambda r: r["id"]) == sorted(
        original["transactions"], key=lambda r: r["id"]
    )
    for name in ("vw_monthly_cashflow", "vw_fixed_cost_monthly_summary"):
        by_period = {row["period"]: row for row in original[name]}
        again_by_period = {row["period"]: row for row in again[name]}
        for row in upgraded[name]:
            assert row == again_by_period[row["period"]]
            old = by_period[row["period"]]
            changed = {key for key, value in old.items() if row[key] != value}
            assert changed == (
                {"savings_rate"}
                if name == "vw_monthly_cashflow" and row["period"] == "2026-03"
                else set()
            )
            assert set(row) - set(old) == (
                {"total_outflow", "living_spend"}
                if name == "vw_monthly_cashflow"
                else {"living_spend"}
            )
