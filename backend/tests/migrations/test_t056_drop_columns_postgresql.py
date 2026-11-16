"""Destructive T056 step: counts guard, approval invalidation and real roundtrip."""

import asyncio
import importlib.util
from pathlib import Path
import subprocess

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from test_nature_axes_migration_postgresql import _alembic, scratch_url as scratch_url
from test_t056_retirement_postgresql import capture

BEFORE = "20261117_0041"
DROP = "20261117_0042"
VERSIONS = Path(__file__).resolve().parents[2] / "alembic/versions"
SPEC = importlib.util.spec_from_file_location(
    "t056_drop", VERSIONS / "20261117_0042_drop_legacy_classification_columns.py"
)
migration = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(migration)
OLD = {name for name, _ in migration.LEGACY_COLUMNS}


async def execute(url, *sql):
    engine = create_async_engine(url)
    try:
        async with engine.begin() as db:
            for statement in sql:
                result = await db.execute(text(statement))
            return (
                [dict(row) for row in result.mappings()] if result.returns_rows else []
            )
    finally:
        await engine.dispose()


INSERT = "INSERT INTO transactions (id,date,time,type,category_major,description,merchant,amount) VALUES (1,'2026-01-05','12:00','지출','synthetic-category','synthetic-merchant','synthetic-merchant',-100)"
COUNTER_CASES = [
    ("UPDATE transactions SET cost_kind='fixed'", "payment_form_only_in_legacy_count"),
    (
        "UPDATE transactions SET cost_kind='variable', spend_necessity='essential'",
        "adjustability_only_in_legacy_count",
    ),
    (
        "UPDATE transactions SET recurring_payment_kind='installment'",
        "review_flag_only_in_legacy_count",
    ),
    ("UPDATE transactions SET cost_kind='unrecognized'", "unknown_value_count"),
    (
        "UPDATE transactions SET type='수입', cost_kind='variable'",
        "non_expense_legacy_count",
    ),
    (
        "UPDATE transactions SET cost_classification_source='manual'",
        "provenance_only_in_legacy_count",
    ),
    (
        "UPDATE transactions SET cost_kind='variable', superseded_by_transaction_id=id",
        "lineage_cycle_count",
    ),
    (
        "UPDATE transactions SET cost_kind='fixed', recurring_payment_kind='monthly_recurring'; INSERT INTO recurring_commitments (match_scope,merchant,category_major,amount_kind,origin) VALUES ('merchant','synthetic-merchant','synthetic-category','fixed','migration')",
        "commitment_attribute_only_in_legacy_count",
    ),
]


@pytest.mark.parametrize("statement,counter", COUNTER_CASES)
def test_drop_refuses_every_unrepresented_kind_and_changes_nothing(
    scratch_url, statement, counter
):
    _alembic(scratch_url, "upgrade", BEFORE)
    asyncio.run(execute(scratch_url, INSERT, *statement.split("; ")))
    counts = asyncio.run(execute(scratch_url, migration.PREFLIGHT_SQL))[0]
    assert counts[counter] == 1
    before = asyncio.run(
        execute(scratch_url, "SELECT to_jsonb(t) AS value FROM transactions t")
    )
    with pytest.raises(subprocess.CalledProcessError) as error:
        _alembic(scratch_url, "upgrade", DROP)
    assert b"T056 column drop refused" in error.value.stderr
    assert counter.encode() in error.value.stderr
    assert asyncio.run(
        execute(scratch_url, "SELECT version_num FROM alembic_version")
    ) == [{"version_num": BEFORE}]
    assert (
        asyncio.run(
            execute(scratch_url, "SELECT to_jsonb(t) AS value FROM transactions t")
        )
        == before
    )


def test_drop_counts_inactive_rows_and_follows_replacement_classification(scratch_url):
    _alembic(scratch_url, "upgrade", BEFORE)
    asyncio.run(
        execute(
            scratch_url,
            INSERT,
            "UPDATE transactions SET is_deleted=true, cost_kind='variable', spend_necessity='essential'",
        )
    )
    assert (
        asyncio.run(execute(scratch_url, migration.PREFLIGHT_SQL))[0][
            "adjustability_only_in_legacy_count"
        ]
        == 1
    )
    asyncio.run(
        execute(
            scratch_url,
            "INSERT INTO transactions (id,date,time,type,category_major,description,merchant,amount) VALUES (2,'2026-01-05','13:00','지출','synthetic-category','synthetic-replacement','synthetic-replacement',-100)",
            "UPDATE transactions SET superseded_by_transaction_id=2 WHERE id=1",
            "INSERT INTO transaction_nature_overrides (transaction_id,adjustability,source) VALUES (2,'protected','migration')",
        )
    )
    assert all(
        value == 0
        for value in asyncio.run(execute(scratch_url, migration.PREFLIGHT_SQL))[
            0
        ].values()
    )
    _alembic(scratch_url, "upgrade", DROP)


def test_drop_preserves_read_values_and_invalidates_old_approvals_even_when_forced(
    scratch_url,
):
    _alembic(scratch_url, "upgrade", BEFORE)
    asyncio.run(
        execute(
            scratch_url,
            INSERT,
            "UPDATE transactions SET cost_kind='variable', spend_necessity='essential',cost_classification_source='manual'",
            "INSERT INTO transaction_nature_overrides (transaction_id,adjustability,source) VALUES (1,'protected','migration')",
            "INSERT INTO upload_logs (id,filename,snapshot_date,status) VALUES (1,'synthetic.xlsx','2026-01-31','success')",
            "INSERT INTO upload_rollback_points (upload_log_id,status,snapshot,pre_fingerprint,post_fingerprint) SELECT 1,'ready',jsonb_build_object('transactions',jsonb_agg(to_jsonb(t))),'{}','{}' FROM transactions t",
            "INSERT INTO upload_review_operations (id,binding_digest,state_digest,file_sha256,snapshot_date,status,version,plan_digest,payload) VALUES ('synthetic-review',repeat('a',64),repeat('b',64),repeat('c',64),'2026-01-31','prepared',1,repeat('d',64),json_build_object('status','prepared','synthetic_evidence',true))",
            "CREATE INDEX synthetic_legacy_cost_index ON transactions(cost_kind)",
            "ALTER TABLE transactions ADD CONSTRAINT synthetic_legacy_cost_check CHECK(cost_kind IN ('fixed','variable'))",
        )
    )
    counts = asyncio.run(execute(scratch_url, migration.PREFLIGHT_SQL))[0]
    assert all(value == 0 for value in counts.values())
    before = asyncio.run(capture(scratch_url))
    _alembic(scratch_url, "upgrade", DROP)
    after = asyncio.run(capture(scratch_url))
    assert after[0] == before[0]
    assert after[1] == before[1]  # B changes no views at all
    assert after[2] == before[2]
    assert after[3] == [
        {k: v for k, v in row.items() if k not in OLD} for row in before[3]
    ]

    async def historical_report_is_retired():
        from app.tools.nature_axes_migration_report import build_report

        engine = create_async_engine(scratch_url)
        try:
            async with engine.connect() as db:
                with pytest.raises(
                    ValueError, match="Legacy classification columns were retired"
                ):
                    await build_report(db)
        finally:
            await engine.dispose()

    asyncio.run(historical_report_is_retired())
    assert asyncio.run(
        execute(scratch_url, "SELECT status,payload FROM upload_review_operations")
    ) == [
        {"status": "stale", "payload": {"status": "stale", "synthetic_evidence": True}}
    ]
    points = asyncio.run(
        execute(scratch_url, "SELECT status,snapshot FROM upload_rollback_points")
    )
    assert points[0]["status"] == "expired"
    assert (
        points[0]["snapshot"]["transactions"][0]["spend_necessity"] == "essential"
    )  # raw evidence kept
    assert (
        asyncio.run(
            execute(
                scratch_url,
                "SELECT indexname FROM pg_indexes WHERE indexname='synthetic_legacy_cost_index'",
            )
        )
        == []
    )

    async def refuse_force():
        from sqlalchemy.ext.asyncio import async_sessionmaker
        from app.services.upload_rollback_service import RollbackError, rollback_upload

        engine = create_async_engine(scratch_url)
        try:
            async with async_sessionmaker(engine)() as db:
                for force in (False, True):
                    with pytest.raises(RollbackError) as error:
                        await rollback_upload(db, 1, accept_changes=force)
                    assert error.value.code == "not_latest"
        finally:
            await engine.dispose()

    asyncio.run(refuse_force())
    _alembic(scratch_url, "downgrade", BEFORE)
    restored = asyncio.run(
        execute(
            scratch_url,
            "SELECT cost_kind,fixed_cost_necessity,spend_necessity,cost_classification_source,recurring_payment_kind FROM transactions",
        )
    )
    assert all(value is None for value in restored[0].values())
    columns = asyncio.run(
        execute(
            scratch_url,
            "SELECT column_name,is_nullable FROM information_schema.columns WHERE table_name='transactions'",
        )
    )
    assert {r["column_name"] for r in columns if r["is_nullable"] == "YES"} >= OLD
    _alembic(scratch_url, "upgrade", DROP)
    assert asyncio.run(capture(scratch_url))[0] == before[0]


def test_preflight_document_is_exact_and_counts_only():
    path = Path(__file__).resolve().parents[3] / "docs/agents/t056-drop-preflight.sql"
    sql = (
        "\n".join(
            line for line in path.read_text().splitlines() if not line.startswith("--")
        )
        .strip()
        .removesuffix(";")
    )
    assert sql == migration.PREFLIGHT_SQL.strip()
    assert all(
        "count" in field.lower()
        for field in migration.PREFLIGHT_SQL.rsplit("SELECT", 1)[1]
        .split("FROM state")[0]
        .split(" AS ")[1:]
    )


def test_explicit_new_human_decision_takes_precedence_over_frozen_values(scratch_url):
    _alembic(scratch_url, "upgrade", BEFORE)
    asyncio.run(
        execute(
            scratch_url,
            INSERT,
            "UPDATE transactions SET cost_kind='variable',spend_necessity='essential',cost_classification_source='manual'",
            "INSERT INTO transaction_nature_overrides (transaction_id,adjustability,source) VALUES (1,'adjustable','user')",
        )
    )
    assert all(
        value == 0
        for value in asyncio.run(execute(scratch_url, migration.PREFLIGHT_SQL))[
            0
        ].values()
    )
    _alembic(scratch_url, "upgrade", DROP)
    assert asyncio.run(
        execute(scratch_url, "SELECT adjustability FROM vw_transaction_nature")
    ) == [{"adjustability": "adjustable"}]


def test_pending_import_and_unknown_external_view_dependency_refuse_drop(scratch_url):
    _alembic(scratch_url, "upgrade", BEFORE)
    asyncio.run(
        execute(
            scratch_url,
            INSERT,
            "INSERT INTO upload_logs (id,filename,snapshot_date,status) VALUES (1,'synthetic.xlsx','2026-01-31','processing')",
        )
    )
    with pytest.raises(subprocess.CalledProcessError) as error:
        _alembic(scratch_url, "upgrade", DROP)
    assert b"imports are pending/processing" in error.value.stderr
    asyncio.run(
        execute(
            scratch_url,
            "UPDATE upload_logs SET status='success'",
            "CREATE VIEW synthetic_external_legacy_reader AS SELECT cost_kind FROM transactions",
        )
    )
    with pytest.raises(subprocess.CalledProcessError) as error:
        _alembic(scratch_url, "upgrade", DROP)
    assert b"depend" in error.value.stderr.lower()
    assert asyncio.run(
        execute(scratch_url, "SELECT version_num FROM alembic_version")
    ) == [{"version_num": BEFORE}]
