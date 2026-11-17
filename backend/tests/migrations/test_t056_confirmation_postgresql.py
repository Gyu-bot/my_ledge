"""T056 확인·편집 이력: 합성 DB 안의 새 스키마만 사용한다."""

import os
import subprocess
import sys
from datetime import date, time
from pathlib import Path
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select, text
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.database import get_db_session
from app.main import app
from app.models.nature_axes import RecurringCommitment, TransactionNatureOverride
from app.models.transaction import Transaction
from app.schemas.nature_axes import RecurringCommitmentUpdateRequest
from app.services.nature_axes_service import update_commitment

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "services"))
from read_surface_ledger import build_read_surface_ledger  # noqa: E402

BACKEND = Path(__file__).resolve().parents[2]
PREFLIGHT = BACKEND.parent / "docs/agents/t056-drop-preflight.sql"
BEFORE, AFTER = "20261117_0041", "20261117_0042"


def migrate(url, schema, action, revision):
    # Alembic의 실제 전체 이행을 실행하되 새 DB를 만들거나 다른 스키마를 읽지 않는다.
    script = """
import asyncpg, functools, sys
from alembic.config import main
asyncpg.connect = functools.partial(asyncpg.connect, server_settings={'search_path': sys.argv.pop(1)})
main()
"""
    result = subprocess.run(
        [sys.executable, "-c", script, schema, action, revision],
        cwd=BACKEND,
        env={**os.environ, "DATABASE_URL": url, "API_KEY": "test-api-key"},
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stderr


@pytest.fixture
async def migrated_db():
    url = os.getenv("REVIEW_TEST_DATABASE_URL")
    if not url:
        pytest.skip("isolated synthetic REVIEW_TEST_DATABASE_URL not supplied")
    assert make_url(url).host in ("localhost", "127.0.0.1", "::1")
    schema = "confirmation_test_" + uuid4().hex
    admin = create_async_engine(url)
    async with admin.begin() as conn:
        await conn.execute(text(f'CREATE SCHEMA "{schema}"'))
    engine = create_async_engine(
        url, connect_args={"server_settings": {"search_path": schema}}
    )
    try:
        migrate(url, schema, "upgrade", AFTER)
        yield url, schema, engine, async_sessionmaker(engine, expire_on_commit=False)
    finally:
        await engine.dispose()
        async with admin.begin() as conn:
            await conn.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
        await admin.dispose()


def tx(name, **fields):
    return Transaction(
        date=date(2026, 2, 5),
        time=time(12),
        type="지출",
        category_major="synthetic",
        merchant=name,
        description=name,
        amount=-100,
        **fields,
    )


async def catalog(engine):
    async with engine.connect() as db:
        definitions = dict(
            (
                await db.execute(
                    text(
                        "SELECT viewname, definition FROM pg_views WHERE schemaname=current_schema()"
                    )
                )
            ).all()
        )
        views = {}
        for name in definitions:
            views[name] = (
                await db.execute(
                    text(
                        f"SELECT COALESCE(jsonb_agg(to_jsonb(v) ORDER BY to_jsonb(v)::text), '[]'::jsonb) FROM \"{name}\" v"
                    )
                )
            ).scalar_one()
        rows = {}
        for name in (
            "transactions",
            "recurring_commitments",
            "transaction_nature_overrides",
        ):
            rows[name] = (
                await db.execute(
                    text(
                        f"SELECT COALESCE(jsonb_agg(to_jsonb(t) - 'legacy_classification_edited' - 'attributes_confirmed_at' ORDER BY to_jsonb(t)::text), '[]'::jsonb) FROM \"{name}\" t"
                    )
                )
            ).scalar_one()
        return definitions, views, rows


async def capture(factory):
    async def override():
        async with factory() as db:
            yield db

    app.dependency_overrides[get_db_session] = override
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://testserver"
        ) as client:
            paths = sorted(
                route.path
                for route in app.routes
                if hasattr(route, "methods")
                and "GET" in route.methods
                and route.path.startswith(
                    ("/api/v1/read/", "/api/v1/analytics/", "/api/v1/metrics/")
                )
                and "{" not in route.path
            )
            paths += [
                "/api/v1/read/commitments?view=summary",
                "/api/v1/transactions?per_page=200&start_date=2026-02-01&end_date=2026-02-28",
            ]
            bodies = {}
            for path in paths:
                result = await client.get(path, headers={"X-API-Key": "test-api-key"})
                assert result.status_code == 200, (path, result.text)
                # bytes로 대조한다. 응답의 생성 시각 등도 임의로 제거하지 않는다.
                bodies[path] = result.content
            return bodies
    finally:
        app.dependency_overrides.pop(get_db_session, None)


async def test_roundtrip_preserves_all_read_analytics_and_axes(migrated_db):
    url, schema, engine, factory = migrated_db
    async with factory() as db:
        # 과거 0042 왕복 검증에서 현재 ORM이 읽는 후속 메타데이터를 준비한다.
        await db.execute(
            text(
                "ALTER TABLE recurring_commitments ADD COLUMN merchant_match VARCHAR(10) NOT NULL DEFAULT 'exact'"
            )
        )
        await build_read_surface_ledger(db, purchases_per_month=8)
        manual = tx(
            "synthetic-manual",
            cost_classification_source="manual",
            spend_necessity="essential",
        )
        no_override = tx("synthetic-no-override", cost_classification_source="manual")
        automatic = tx("synthetic-auto", cost_classification_source="rule")
        target = tx("synthetic-replacement")
        db.add_all([manual, no_override, automatic, target])
        await db.flush()
        old = tx(
            "synthetic-old",
            cost_classification_source="manual",
            superseded_by_transaction_id=target.id,
            source_lifecycle_status="superseded",
        )
        db.add(old)
        db.add(
            TransactionNatureOverride(
                transaction_id=manual.id, adjustability="protected", source="migration"
            )
        )
        await db.commit()
        ids = [manual.id, no_override.id, old.id, target.id]
    baseline_catalog = await catalog(engine)
    baseline = await capture(factory)
    migrate(url, schema, "downgrade", BEFORE)
    assert await catalog(engine) == baseline_catalog
    migrate(url, schema, "upgrade", AFTER)
    assert await catalog(engine) == baseline_catalog
    after = await capture(factory)
    assert len(after) >= 20
    for path, body in baseline.items():
        if path.startswith("/api/v1/transactions"):
            import json

            before_tx, after_tx = json.loads(body), json.loads(after[path])
            expected_ids = {manual.id, no_override.id, target.id}
            before_marks = {
                item["id"]: item["is_edited"] for item in before_tx["items"]
            }
            after_marks = {item["id"]: item["is_edited"] for item in after_tx["items"]}
            assert expected_ids <= before_marks.keys()
            assert expected_ids <= after_marks.keys()
            assert all(
                before_marks[transaction_id] is False for transaction_id in expected_ids
            )
            assert all(
                after_marks[transaction_id] is True for transaction_id in expected_ids
            )
            assert after_marks[automatic.id] is False

            def without_mark(value):
                if isinstance(value, dict):
                    return {
                        k: without_mark(v) for k, v in value.items() if k != "is_edited"
                    }
                if isinstance(value, list):
                    return [without_mark(v) for v in value]
                return value

            assert without_mark(before_tx) == without_mark(after_tx)
        else:
            assert after[path] == body, path
    async with factory() as db:
        assert set(
            (
                await db.scalars(
                    select(Transaction.id).where(
                        Transaction.legacy_classification_edited.is_(True)
                    )
                )
            ).all()
        ) >= set(ids)
        assert (
            await db.get(Transaction, automatic.id)
        ).legacy_classification_edited is False
        assert (
            await db.get(TransactionNatureOverride, manual.id)
        ).source == "migration"
        assert await db.get(TransactionNatureOverride, no_override.id) is None
        counts = (await db.execute(text(PREFLIGHT.read_text()))).mappings().one()
        assert counts["hand_edit_mark_not_preserved_count"] == 0
        await db.execute(
            text(
                "UPDATE transactions SET legacy_classification_edited=FALSE WHERE id=:id"
            ),
            {"id": no_override.id},
        )
        missing = (await db.execute(text(PREFLIGHT.read_text()))).mappings().one()
        assert missing["hand_edit_mark_not_preserved_count"] == 1
        await db.rollback()
    migrate(url, schema, "downgrade", BEFORE)
    assert await catalog(engine) == baseline_catalog
    migrate(url, schema, "upgrade", AFTER)
    assert await capture(factory) == after


@pytest.mark.parametrize("decision", [None, "yearly", "as_is"])
async def test_mixed_migrated_members_need_confirmation(migrated_db, decision):
    _, _, _, factory = migrated_db
    async with factory() as db:
        await db.execute(
            text(
                "ALTER TABLE recurring_commitments ADD COLUMN merchant_match VARCHAR(10) NOT NULL DEFAULT 'exact'"
            )
        )
        commitment = RecurringCommitment(
            match_scope="category", category_major="synthetic", origin="migration"
        )
        db.add(commitment)
        db.add_all(
            [
                tx(
                    "synthetic-monthly",
                    cost_kind="fixed",
                    recurring_payment_kind="monthly_recurring",
                ),
                tx(
                    "synthetic-other",
                    cost_kind="variable",
                    recurring_payment_kind="monthly_recurring",
                ),
                tx(
                    "synthetic-not-recurring",
                    cost_kind="fixed",
                    recurring_payment_kind="not_recurring",
                ),
            ]
        )
        await db.commit()
        before = (await db.execute(text(PREFLIGHT.read_text()))).mappings().one()
        assert before["commitment_attribute_only_in_legacy_count"] > 0
        assert before["payment_form_only_in_legacy_count"] > 0
        await update_commitment(
            db,
            commitment.id,
            (
                RecurringCommitmentUpdateRequest(confirm_attributes=True)
                if decision == "as_is"
                else RecurringCommitmentUpdateRequest(
                    cycle=decision, amount_kind="variable"
                )
            ),
        )
        after = (await db.execute(text(PREFLIGHT.read_text()))).mappings().one()
        assert len(after) == 9
        assert set(after.values()) == {0}


async def test_confirmed_attributes_and_manual_mark_survive_reimport_rollback(
    migrated_db,
):
    from app.parsers.transactions import TransactionRow
    from app.schemas.upload import UploadApplyRequest, UploadApplySelection
    from app.services import upload_rollback_service as rb
    from app.services.upload_apply_service import apply_transaction_upload_from_rows
    from app.services.upload_preview_service import preview_transaction_upload_from_rows

    url, schema, _, factory = migrated_db
    # 실제 현재 rollback 서비스는 최신 모델 전체를 스냅샷으로 읽는다.
    migrate(url, schema, "upgrade", "head")
    async with factory() as db:
        existing = tx("synthetic-old", legacy_classification_edited=True)
        bundle = RecurringCommitment(
            match_scope="merchant",
            merchant="synthetic-old",
            category_major="synthetic",
            origin="migration",
            cycle=None,
            amount_kind=None,
        )
        db.add_all([existing, bundle])
        await db.flush()
        db.add(
            TransactionNatureOverride(
                transaction_id=existing.id,
                adjustability="adjustable",
                source="migration",
            )
        )
        await db.commit()
        await update_commitment(
            db, bundle.id, RecurringCommitmentUpdateRequest(confirm_attributes=True)
        )
        before = await rb.fingerprint(db)
        confirmed_at = bundle.attributes_confirmed_at
        incoming: list[TransactionRow] = [
            {
                "date": existing.date,
                "time": time(15),
                "type": "지출",
                "category_major": "synthetic",
                "category_minor": None,
                "description": "synthetic-new",
                "merchant": "synthetic-new",
                "amount": -100,
                "currency": "KRW",
                "payment_method": None,
                "memo": None,
            }
        ]
        preview = await preview_transaction_upload_from_rows(db, incoming)
        change = preview.review_required_changes[0]
        applied = await apply_transaction_upload_from_rows(
            db_session=db,
            parsed_rows=incoming,
            filename="synthetic.xlsx",
            snapshot_date=existing.date,
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
        replacement = await db.scalar(
            select(Transaction).where(Transaction.id != existing.id)
        )
        assert replacement.legacy_classification_edited is True
        override = await db.get(TransactionNatureOverride, replacement.id)
        assert override.source == "migration"
        assert override.commitment_id == bundle.id
        assert (
            await db.get(RecurringCommitment, bundle.id)
        ).attributes_confirmed_at == confirmed_at
        await rb.rollback_upload(db, applied.upload_id, accept_changes=False)
    async with factory() as db:
        assert await rb.fingerprint(db) == before


async def test_old_rollback_snapshot_is_rejected_before_restore(migrated_db):
    from app.models.upload_log import UploadLog
    from app.models.upload_rollback_point import UploadRollbackPoint
    from app.services import upload_rollback_service as rb

    url, schema, _, factory = migrated_db
    # 실제 현재 rollback 서비스는 최신 모델 전체를 스냅샷으로 읽는다.
    migrate(url, schema, "upgrade", "head")
    async with factory() as db:
        db.add(tx("synthetic", legacy_classification_edited=True))
        log = UploadLog(
            filename="synthetic.xlsx", snapshot_date=date(2026, 2, 5), status="success"
        )
        db.add(log)
        await db.flush()
        point_id = await rb.begin_point(db, log.id)
        await rb.finish_point(db, point_id, log.id)
        await db.commit()
        # 0041 당시 캡처된 전체 행에는 새 컬럼이 없다.
        point = await db.get(UploadRollbackPoint, point_id)
        snapshot = dict(point.snapshot)
        snapshot["transactions"] = [
            {k: v for k, v in row.items() if k != "legacy_classification_edited"}
            for row in snapshot["transactions"]
        ]
        point.snapshot = snapshot
        await db.commit()
        before = await rb.fingerprint(db)
        assert (await rb.list_points(db))[0]["can_rollback"] is False
        with pytest.raises(rb.RollbackError) as error:
            await rb.rollback_upload(db, log.id, accept_changes=True)
        assert error.value.code == "schema_changed"
        assert await rb.fingerprint(db) == before
