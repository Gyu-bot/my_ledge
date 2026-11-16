"""T056 migration on real PostgreSQL with synthetic rows (no real financial data).

Set METRIC_TEST_DATABASE_URL (or REVIEW_TEST_DATABASE_URL) to a disposable
loopback server. Each test creates and drops its own scratch database.
"""

import asyncio
import importlib.util
import json
import os
import subprocess
import sys
from collections.abc import Iterator
from datetime import UTC, date, datetime, time
from pathlib import Path
from uuid import uuid4

import pytest
from sqlalchemy import select, text
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.models.installment_plan import InstallmentPlan
from app.models.installment_transaction_link import InstallmentTransactionLink
from app.models.loan_account import LoanAccount
from app.models.loan_transaction_link import LoanTransactionLink
from app.models.nature_axes import RecurringCommitment, TransactionNatureOverride
from app.models.settlement_group import SettlementMatch
from app.models.transaction import Transaction, TransactionSourceLifecycleStatus
from app.parsers.transactions import TransactionRow
from app.schemas.upload import UploadApplyRequest, UploadApplySelection
from app.services import upload_rollback_service as rb
from app.services.metric_views import FLOW_LINES_VIEW, TRANSACTION_NATURE_VIEW
from app.services.upload_apply_service import apply_transaction_upload_from_rows
from app.services.upload_preview_service import preview_transaction_upload_from_rows
from app.tools.nature_axes_migration_report import build_report

BACKEND_DIR = Path(__file__).resolve().parents[2]
BEFORE_T056 = "20261115_0035"


def _admin_url() -> str:
    url = os.getenv("METRIC_TEST_DATABASE_URL") or os.getenv("REVIEW_TEST_DATABASE_URL")
    if not url:
        pytest.skip("isolated PostgreSQL METRIC_TEST_DATABASE_URL not supplied")
    assert make_url(url).host in ("localhost", "127.0.0.1", "::1")
    return url


def _alembic(url: str, *args: str) -> None:
    subprocess.run(
        [sys.executable, "-m", "alembic", *args],
        cwd=BACKEND_DIR,
        env={**os.environ, "DATABASE_URL": url, "API_KEY": "test-api-key"},
        check=True,
        capture_output=True,
    )


@pytest.fixture
def scratch_url() -> Iterator[str]:
    admin_url = _admin_url()
    database = "nature_axes_" + uuid4().hex
    url = (
        make_url(admin_url).set(database=database).render_as_string(hide_password=False)
    )

    async def run(statement: str) -> None:
        engine = create_async_engine(admin_url, isolation_level="AUTOCOMMIT")
        async with engine.connect() as connection:
            await connection.execute(text(statement))
        await engine.dispose()

    asyncio.run(run(f'CREATE DATABASE "{database}"'))
    try:
        yield url
    finally:
        asyncio.run(run(f'DROP DATABASE IF EXISTS "{database}" WITH (FORCE)'))


def _tx(merchant: str, amount: int, day: date, **fields: object) -> Transaction:
    values: dict[str, object] = {
        "date": day,
        "time": time(12, 0),
        "type": "지출",
        "category_major": "cat-a",
        "category_minor": None,
        "description": merchant,
        "merchant": merchant,
        "amount": amount,
        "currency": "KRW",
        "payment_method": "card-a",
    }
    values.update(fields)
    return Transaction(**values)


JAN, FEB = date(2026, 1, 5), date(2026, 2, 5)
ESS = {"cost_kind": "fixed", "fixed_cost_necessity": "essential"}


def _ledger() -> dict[str, Transaction]:
    return {
        # G1: unanimous protected bundle, plus same-key ad hoc rows.
        "fixed_ess_1": _tx("sub-1", -15_000, JAN, **ESS),
        "fixed_ess_2": _tx(
            "sub-1", -15_000, FEB, cost_kind="fixed", spend_necessity="essential"
        ),
        "same_key_variable": _tx(
            "sub-1", -3_000, FEB, cost_kind="variable", spend_necessity="discretionary"
        ),
        "same_key_unclassified": _tx("sub-1", -2_000, FEB),
        "refund": _tx("sub-1", 5_000, date(2026, 2, 25)),
        # G2: members disagree -> bundle adjustability stays null.
        "fixed_disc": _tx(
            "sub-2",
            -9_000,
            FEB,
            cost_kind="fixed",
            spend_necessity="discretionary",
            recurring_payment_kind="monthly_recurring",
        ),
        "fixed_empty": _tx(
            "sub-2",
            -9_000,
            JAN,
            cost_kind="fixed",
            recurring_payment_kind="monthly_recurring",
        ),
        # G3: variable-amount monthly commitment.
        "variable_monthly": _tx(
            "sub-3",
            -7_000,
            FEB,
            category_major="cat-b",
            category_minor="minor-x",
            cost_kind="variable",
            spend_necessity="essential",
            recurring_payment_kind="monthly_recurring",
        ),
        "monthly_no_cost_kind": _tx(
            "sub-4", -4_000, FEB, recurring_payment_kind="monthly_recurring"
        ),
        "necessity_conflict": _tx(
            "sub-5",
            -6_000,
            FEB,
            cost_kind="fixed",
            fixed_cost_necessity="essential",
            spend_necessity="discretionary",
        ),
        "deleted_committed": _tx("sub-6", -5_000, FEB, is_deleted=True, **ESS),
        "variable_essential_1": _tx(
            "grocer", -20_000, FEB, cost_kind="variable", spend_necessity="essential"
        ),
        "variable_essential_2": _tx(
            "grocer",
            -21_000,
            date(2026, 2, 6),
            cost_kind="variable",
            spend_necessity="essential",
        ),
        "variable_empty": _tx("v-empty", -1_000, FEB, cost_kind="variable"),
        "unclassified": _tx("misc", -500, FEB),
        "no_cost_kind_necessity": _tx(
            "ncn", -800, FEB, spend_necessity="discretionary"
        ),
        "installment_kind": _tx(
            "inst-unlinked",
            -33_000,
            FEB,
            recurring_payment_kind="installment",
            spend_necessity="discretionary",
        ),
        "fixed_not_recurring": _tx(
            "fnr", -12_000, FEB, recurring_payment_kind="not_recurring", **ESS
        ),
        "loan": _tx("lender", -500_000, FEB, spend_necessity="discretionary"),
        "installment_linked": _tx("shop-i", -100_000, FEB, cost_kind="variable"),
        "income": _tx("payer", 3_000_000, FEB, type="수입", cost_kind="fixed"),
        "transfer": _tx(
            "own", -1_000_000, FEB, type="이체", spend_necessity="essential"
        ),
        "superseded_old": _tx("old-text", -7_777, FEB, **ESS),
        "superseded_new": _tx("new-text", -7_777, FEB, **ESS),
        "merged": _tx("merged", -888, FEB, **ESS),
        "foreign": _tx(
            "abroad",
            -10,
            FEB,
            currency="USD",
            cost_kind="variable",
            spend_necessity="discretionary",
        ),
    }


async def _seed(session: AsyncSession) -> dict[str, int]:
    # 현재 ORM으로 0035 장부를 심기 위한 추가 이력 컬럼이다. 이 테스트가
    # 검증하는 과거 축 이행은 이 컬럼을 읽거나 쓰지 않는다.
    await session.execute(
        text(
            "ALTER TABLE transactions ADD COLUMN legacy_classification_edited "
            "BOOLEAN NOT NULL DEFAULT FALSE"
        )
    )
    rows = _ledger()
    session.add_all(rows.values())
    await session.flush()
    ids = {key: row.id for key, row in rows.items()}
    rows[
        "superseded_old"
    ].source_lifecycle_status = TransactionSourceLifecycleStatus.SUPERSEDED.value
    rows["superseded_old"].superseded_by_transaction_id = ids["superseded_new"]
    rows["merged"].merged_into_id = ids["variable_essential_1"]
    loan = LoanAccount(lender="lender-x", product_name="product-x")
    plan = InstallmentPlan(
        display_name="plan-x",
        merchant="shop-i",
        total_installments=3,
        monthly_amount=100_000,
        first_payment_date=FEB,
    )
    session.add_all([loan, plan])
    await session.flush()
    session.add_all(
        [
            LoanTransactionLink(transaction_id=ids["loan"], loan_account_id=loan.id),
            InstallmentTransactionLink(
                transaction_id=ids["installment_linked"],
                installment_plan_id=plan.id,
                installment_number=1,
            ),
            SettlementMatch(
                original_transaction_id=ids["fixed_ess_2"],
                settlement_transaction_id=ids["refund"],
                status="user_confirmed",
                matched_amount=5_000,
                matched_at=datetime(2026, 2, 25, tzinfo=UTC),
            ),
        ]
    )
    await session.commit()
    return ids


async def _fetch(url: str, sql: str) -> list[tuple]:
    engine = create_async_engine(url)
    try:
        async with engine.connect() as connection:
            return [tuple(row) for row in (await connection.execute(text(sql))).all()]
    finally:
        await engine.dispose()


VIEWDEFS = (
    "SELECT viewname, definition FROM pg_views "
    "WHERE schemaname = current_schema() ORDER BY viewname"
)
TX_CHECKSUM = (
    "SELECT count(*), md5(string_agg(to_jsonb(t)::text, chr(10) ORDER BY t.id)) "
    "FROM transactions t"
)
QUEUE = (
    "SELECT transaction_id, needs_cost_kind, needs_fixed_cost_necessity, "
    "needs_spend_necessity, needs_recurring_payment_kind FROM "
    "vw_unclassified_work_queue ORDER BY transaction_id"
)
STATE = (
    "SELECT (SELECT json_agg(r ORDER BY r.id) FROM (SELECT id, match_scope, merchant, "
    "category_major, category_minor, cycle, amount_kind, adjustability, start_date, "
    "end_date, origin FROM recurring_commitments) r), (SELECT json_agg(o ORDER BY "
    "o.transaction_id) FROM (SELECT transaction_id, adjustability, commitment_id, "
    "excluded_from_commitments, installment_link_unconfirmed, necessity_conflict, "
    "source FROM transaction_nature_overrides) o)"
)


async def _report(url: str):  # type: ignore[no-untyped-def]
    engine = create_async_engine(url)
    try:
        async with engine.connect() as connection:
            return await build_report(connection)
    finally:
        await engine.dispose()


async def _nature(url: str) -> dict[int, dict]:
    engine = create_async_engine(url)
    try:
        async with engine.connect() as connection:
            rows = (
                await connection.execute(select(TRANSACTION_NATURE_VIEW))
            ).mappings()
            return {int(row["transaction_id"]): dict(row) for row in rows}
    finally:
        await engine.dispose()


def test_migration_maps_every_row_and_round_trips(scratch_url: str) -> None:
    _alembic(scratch_url, "upgrade", BEFORE_T056)

    async def seed() -> dict[str, int]:
        engine = create_async_engine(scratch_url)
        try:
            async with async_sessionmaker(engine, expire_on_commit=False)() as session:
                return await _seed(session)
        finally:
            await engine.dispose()

    ids = asyncio.run(seed())
    views_before = asyncio.run(_fetch(scratch_url, VIEWDEFS))
    checksum_before = asyncio.run(_fetch(scratch_url, TX_CHECKSUM))
    queue_before = {row[0]: row for row in asyncio.run(_fetch(scratch_url, QUEUE))}

    # ---- dry-run report before the migration ----
    before = asyncio.run(_report(scratch_url))
    assert not before.migrated
    expected_rows = {
        "loan_linked": 1,
        "installment_linked": 1,
        "installment_kind_unlinked": 1,
        "fixed_not_recurring": 1,
        "fixed_essential": 3,
        "fixed_discretionary": 1,
        "fixed_necessity_empty": 1,
        "fixed_necessity_conflict": 1,
        "variable_monthly_recurring": 1,
        "variable_essential": 2,
        "variable_discretionary": 1,
        "variable_necessity_empty": 1,
        "monthly_recurring_no_cost_kind": 1,
        "no_cost_kind_with_necessity": 1,
        "unclassified": 3,
    }
    assert {k: v.count for k, v in before.mapping_rows.items()} == expected_rows
    assert before.effective_expense_count == 20
    assert before.non_effective_mapped_count == 1
    assert before.predicted_bundle_count == 7
    assert before.predicted_bundles_with_adjustability == 4
    assert before.predicted_bundles_monthly_cycle == 3
    assert before.necessity_conflict_count == 1
    assert before.installment_link_unconfirmed_count == 1
    assert before.checks == {"predicted_conservation": True}

    # ---- migrate ----
    _alembic(scratch_url, "upgrade", "20261117_0040")
    after = asyncio.run(_report(scratch_url))
    assert after.migrated
    assert after.checks == {
        "predicted_conservation": True,
        "every_expense_in_exactly_one_combination": True,
        "actual_total_unchanged": True,
        "flow_lines_total_unchanged": True,
    }
    assert after.mismatches_by_mapping_row == {}
    assert {k: (v.count, v.amount) for k, v in after.actual_combinations.items()} == {
        k: (v.count, v.amount) for k, v in after.predicted_combinations.items()
    }
    assert after.bundles_by_origin == {"migration": 7}
    assert after.category_default_count == 0
    assert asyncio.run(_fetch(scratch_url, TX_CHECKSUM)) == checksum_before

    nature = asyncio.run(_nature(scratch_url))
    bundles = {
        row[1]: row
        for row in asyncio.run(
            _fetch(
                scratch_url,
                "SELECT id, merchant, cycle, amount_kind, adjustability, start_date "
                "FROM recurring_commitments",
            )
        )
    }
    assert bundles["sub-1"][2:] == (None, "fixed", "protected", JAN)
    assert bundles["sub-2"][2:] == ("monthly", "fixed", None, JAN)
    assert bundles["sub-3"][2:] == ("monthly", "variable", "protected", FEB)
    assert bundles["sub-4"][2:] == ("monthly", None, None, FEB)
    assert bundles["sub-5"][4] is None
    assert "sub-6" in bundles  # deleted rows are restorable human classification

    def axes(key: str) -> tuple:
        row = nature[ids[key]]
        return (
            row["payment_form"],
            row["commitment_kind"],
            row["adjustability"],
            row["adjustability_source"],
        )

    committed = ("committed", "recurring")
    assert axes("fixed_ess_1") == (*committed, "protected", "commitment")
    assert nature[ids["fixed_ess_1"]]["recurring_commitment_id"] == bundles["sub-1"][0]
    assert axes("same_key_variable") == ("ad_hoc", None, "adjustable", "transaction")
    assert nature[ids["same_key_variable"]]["excluded_from_commitments"]
    assert axes("same_key_unclassified") == ("ad_hoc", None, "undecided", "none")
    assert axes("fixed_disc") == (*committed, "adjustable", "transaction")
    assert axes("fixed_empty") == (*committed, "undecided", "none")
    assert axes("variable_monthly") == (*committed, "protected", "commitment")
    assert axes("monthly_no_cost_kind") == (*committed, "undecided", "none")
    assert axes("necessity_conflict") == (*committed, "undecided", "none")
    assert nature[ids["necessity_conflict"]]["necessity_conflict"]
    assert axes("installment_kind") == ("ad_hoc", None, "adjustable", "transaction")
    assert nature[ids["installment_kind"]]["installment_link_unconfirmed"]
    assert axes("fixed_not_recurring") == ("ad_hoc", None, "protected", "transaction")
    assert axes("variable_essential_1") == ("ad_hoc", None, "protected", "transaction")
    assert axes("no_cost_kind_necessity") == (
        "ad_hoc",
        None,
        "adjustable",
        "transaction",
    )
    assert axes("unclassified") == ("ad_hoc", None, "undecided", "none")
    assert axes("loan") == ("committed", "loan", "protected", "fixed_loan")
    assert axes("installment_linked") == (
        "committed",
        "installment",
        "protected",
        "fixed_installment",
    )
    for key in ("income", "transfer"):
        assert axes(key) == ("not_applicable", None, "not_applicable", "not_applicable")
    for key in ("superseded_old", "merged", "deleted_committed"):
        assert ids[key] not in nature

    lines = asyncio.run(
        _fetch(
            scratch_url,
            "SELECT transaction_id, line_kind, flow_row, adjustability, mapping_note "
            "FROM vw_metric_flow_lines",
        )
    )
    allocation = [row for row in lines if row[1] == "refund_allocation"]
    # The allocated refund carries the original purchase's classification.
    assert allocation == [
        (ids["refund"], "refund_allocation", "committed_recurring", "protected", None)
    ]
    notes = {row[0]: row[4] for row in lines}
    assert notes[ids["necessity_conflict"]] == "necessity_conflict"
    assert notes[ids["installment_kind"]] == "installment_link_unconfirmed"

    # ---- work queue: no recurring-only rows, no superseded/linked/income ----
    queue_after = {row[0]: row for row in asyncio.run(_fetch(scratch_url, QUEUE))}
    assert ids["variable_essential_1"] in queue_before  # old: recurring kind only
    assert ids["superseded_old"] in queue_before
    assert ids["installment_linked"] in queue_before
    for key in (
        "variable_essential_1",
        "variable_essential_2",
        "superseded_old",
        "installment_linked",
        "income",
        "transfer",
        "fixed_ess_1",
        "fixed_disc",
    ):
        assert ids[key] not in queue_after, key
    for key in (
        "unclassified",
        "fixed_empty",
        "necessity_conflict",
        "monthly_no_cost_kind",
    ):
        assert ids[key] in queue_after, key
        assert queue_after[ids[key]][3] is True  # needs_spend_necessity
    assert all(row[4] is False for row in queue_after.values())

    # ---- the backfill is idempotent ----
    state_after = asyncio.run(_fetch(scratch_url, STATE))
    backfill = _load_backfill()

    async def rerun() -> dict[str, int]:
        engine = create_async_engine(scratch_url)
        try:
            async with engine.begin() as connection:
                return await connection.run_sync(backfill.backfill)
        finally:
            await engine.dispose()

    assert asyncio.run(rerun())["bundles_created"] == 0
    assert asyncio.run(_fetch(scratch_url, STATE)) == state_after

    # ---- downgrade restores the 0035 state exactly ----
    _alembic(scratch_url, "downgrade", BEFORE_T056)
    assert asyncio.run(_fetch(scratch_url, VIEWDEFS)) == views_before
    assert asyncio.run(_fetch(scratch_url, TX_CHECKSUM)) == checksum_before
    tables = asyncio.run(
        _fetch(
            scratch_url,
            "SELECT tablename FROM pg_tables WHERE schemaname = current_schema() "
            "AND tablename IN ('recurring_commitments', 'transaction_nature_overrides', "
            "'category_adjustability_defaults')",
        )
    )
    assert tables == []

    # ---- upgrade again: same result, no duplicate bundles ----
    _alembic(scratch_url, "upgrade", "20261117_0040")
    again = asyncio.run(_report(scratch_url))
    assert again.bundles_by_origin == {"migration": 7}
    assert again.mismatches_by_mapping_row == {}
    assert asyncio.run(_nature(scratch_url)).keys() == nature.keys()

    # ---- the CLI prints shares by default and amounts only on request ----
    environment = {**os.environ, "DATABASE_URL": scratch_url, "API_KEY": "test-api-key"}
    cli = [sys.executable, "-m", "app.tools.nature_axes_migration_report"]
    text_out = subprocess.run(
        cli,
        cwd=BACKEND_DIR,
        env=environment,
        capture_output=True,
        text=True,
        check=True,
    ).stdout
    assert "migrated (after)" in text_out and "%" in text_out
    assert "15,000" not in text_out and "net total" not in text_out
    json_out = json.loads(
        subprocess.run(
            [*cli, "--json"],
            cwd=BACKEND_DIR,
            env=environment,
            capture_output=True,
            text=True,
            check=True,
        ).stdout
    )
    assert "effective_expense_total" not in json_out
    assert all("amount" not in stat for stat in json_out["mapping_rows"].values())
    shown = subprocess.run(
        [*cli, "--show-amounts"],
        cwd=BACKEND_DIR,
        env=environment,
        capture_output=True,
        text=True,
        check=True,
    ).stdout
    assert "net total" in shown


def _load_backfill():  # type: ignore[no-untyped-def]
    path = (
        BACKEND_DIR / "alembic" / "versions" / "20261115_0037_nature_axes_backfill.py"
    )
    spec = importlib.util.spec_from_file_location("_backfill", path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_rollback_restores_override_moved_by_reimport(scratch_url: str) -> None:
    _alembic(scratch_url, "upgrade", "head")

    async def scenario() -> None:
        engine = create_async_engine(scratch_url)
        factory = async_sessionmaker(engine, expire_on_commit=False)
        try:
            async with factory() as db:
                existing = _tx(
                    "old-text", -120_000, date(2026, 3, 29), time=time(11, 0)
                )
                db.add(existing)
                await db.flush()
                bundle = RecurringCommitment(
                    match_scope="merchant",
                    merchant="old-text",
                    category_major="cat-a",
                    adjustability="protected",
                    origin="user",
                )
                db.add(bundle)
                db.add(
                    TransactionNatureOverride(
                        transaction_id=existing.id,
                        adjustability="adjustable",
                        source="user",
                    )
                )
                await db.commit()
                before = await rb.fingerprint(db)
                incoming: list[TransactionRow] = [
                    {
                        "date": date(2026, 3, 29),
                        "time": time(14, 30),
                        "type": "지출",
                        "category_major": "cat-a",
                        "category_minor": None,
                        "description": "new-text",
                        "merchant": "new-text",
                        "amount": -120_000,
                        "currency": "KRW",
                        "payment_method": "card-a",
                        "memo": None,
                    }
                ]
                preview = await preview_transaction_upload_from_rows(db, incoming)
                change = preview.review_required_changes[0]
                result = await apply_transaction_upload_from_rows(
                    db_session=db,
                    parsed_rows=incoming,
                    filename="replacement.xlsx",
                    snapshot_date=date(2026, 3, 29),
                    apply_request=UploadApplyRequest(
                        confirmation=True,
                        selections=[
                            UploadApplySelection(
                                change_type=change.change_type,
                                source_row_hash=change.source_row_hash or "",
                                existing_transaction_id=change.existing_transaction_id,
                            )
                        ],
                    ),
                )
            async with factory() as db:
                lines = (
                    await db.execute(
                        select(
                            FLOW_LINES_VIEW.c.transaction_id,
                            FLOW_LINES_VIEW.c.recurring_commitment_id,
                            FLOW_LINES_VIEW.c.adjustability,
                        )
                    )
                ).all()
                assert len(lines) == 1 and lines[0][0] != existing.id
                assert lines[0][1:] == (bundle.id, "adjustable")
                points = await rb.list_points(db)
                assert points[0]["can_rollback"] and points[0]["changed_tables"] == []
                out = await rb.rollback_upload(
                    db, result.upload_id, accept_changes=False
                )
                assert out["restored_counts"]["transaction_nature_overrides"] == 1
            async with factory() as db:
                assert await rb.fingerprint(db) == before
                restored = await db.get(TransactionNatureOverride, existing.id)
                assert restored is not None and restored.adjustability == "adjustable"
        finally:
            await engine.dispose()

    asyncio.run(scenario())
