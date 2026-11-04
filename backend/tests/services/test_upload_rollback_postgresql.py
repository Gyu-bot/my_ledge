"""Upload rollback points on real PostgreSQL (isolated per-test schema on loopback).

Set ROLLBACK_TEST_DATABASE_URL (or REVIEW_TEST_DATABASE_URL) to a disposable server.
"""

import asyncio
import os
from uuid import uuid4

import pytest
from sqlalchemy import func, select, text, update
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.models import Base
from app.models.asset_snapshot import AssetSnapshot
from app.models.transaction import Transaction
from app.models.upload_log import UploadLog
from app.models.upload_rollback_point import UploadRollbackPoint
from app.schemas.upload import UploadApplyRequest, UploadApplySelection
from app.services import upload_rollback_service as rb
from app.services.upload_apply_service import apply_transaction_upload_workbook
from app.services.upload_preview_service import preview_transaction_upload_workbook
from app.services.upload_service import import_transactions_from_workbook
from test_upload_review_service import DAY, apply, prepare, row, tx, workbook


@pytest.fixture
async def pg():
    url = os.getenv("ROLLBACK_TEST_DATABASE_URL") or os.getenv(
        "REVIEW_TEST_DATABASE_URL"
    )
    if not url:
        pytest.skip("isolated PostgreSQL ROLLBACK_TEST_DATABASE_URL not supplied")
    assert make_url(url).host in ("localhost", "127.0.0.1", "::1")
    schema = "rollback_test_" + uuid4().hex
    admin = create_async_engine(url)
    async with admin.begin() as conn:
        await conn.execute(text(f'CREATE SCHEMA "{schema}"'))
    engine = create_async_engine(
        url, connect_args={"server_settings": {"search_path": schema}}
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    try:
        yield async_sessionmaker(engine, expire_on_commit=False)
    finally:
        await engine.dispose()
        async with admin.begin() as conn:
            await conn.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
        await admin.dispose()


async def safe_apply(db, data, tmp_path, day=DAY):
    preview = await preview_transaction_upload_workbook(db, data)
    selections = [
        UploadApplySelection(
            change_type=c.change_type,
            source_row_hash=c.source_row_hash,
            existing_transaction_id=c.existing_transaction_id,
        )
        for c in preview.safe_changes
        if c.source_row_hash
    ]
    return await apply_transaction_upload_workbook(
        db,
        file_bytes=data,
        filename="synthetic.xlsx",
        snapshot_date=day,
        apply_request=UploadApplyRequest(confirmation=True, selections=selections),
        upload_dir=tmp_path / "uploads",
    )


async def state(db):
    return await rb.fingerprint(db)


async def test_scope_covers_every_table_an_import_writes(pg, tmp_path):
    names = {t.name for t in rb.scope_tables()}
    assert {
        "transactions",
        "asset_snapshots",
        "loans",
        "investments",
        "insurance_contracts",
        "user_profile_snapshots",
        "asset_source_runs",
        "asset_source_observations",
    } <= names
    assert not names & rb.EXCLUDED_TABLES
    async with pg() as db:
        before = await state(db)
        await safe_apply(
            db, workbook([row("a"), row("b", -200)], full_snapshots=True), tmp_path
        )
    async with pg() as db:
        tables = (
            (
                await db.execute(
                    text(
                        "select tablename from pg_tables where schemaname = current_schema()"
                    )
                )
            )
            .scalars()
            .all()
        )
        assert set(tables) - names == set(rb.EXCLUDED_TABLES)
        point = await db.scalar(select(UploadRollbackPoint))
        assert point.status == "ready" and point.pre_fingerprint == before
        assert point.post_fingerprint == await state(db) != before


async def test_safe_apply_rollback_restores_exact_pre_state(pg, tmp_path):
    async with pg() as db:
        db.add(tx(name="existing", amount=-50, memo="user memo"))
        await db.commit()
        before = await state(db)
        result = await safe_apply(
            db,
            workbook([row("existing", -50), row("new", -70)], full_snapshots=True),
            tmp_path,
        )
    async with pg() as db:
        assert await db.scalar(select(func.count()).select_from(Transaction)) == 2
        assert await db.scalar(select(func.count()).select_from(AssetSnapshot)) == 1
        points = await rb.list_points(db)
        assert points[0]["can_rollback"] and points[0]["changed_tables"] == []
        out = await rb.rollback_upload(db, result.upload_id, accept_changes=False)
        assert (
            out["status"] == "rolled_back"
            and out["restored_counts"]["transactions"] == 1
        )
    async with pg() as db:
        assert await state(db) == before
        memo = await db.scalar(select(Transaction.memo))
        assert memo == "user memo"
        log = await db.get(UploadLog, result.upload_id)
        assert log.status == "rolled_back"
        with pytest.raises(rb.RollbackError) as again:
            await rb.rollback_upload(db, result.upload_id, accept_changes=True)
        assert again.value.code == "not_latest"


async def test_reviewed_apply_creates_point_and_rolls_back(pg, tmp_path):
    data = workbook([row("reviewed")], full_snapshots=True)
    async with pg() as db:
        before = await state(db)
        plan = await prepare(db, data)
    async with pg() as db:
        done = await apply(db, plan, tmp_path, data)
    async with pg() as db:
        await rb.rollback_upload(db, done.result.upload_id, accept_changes=False)
    async with pg() as db:
        assert await state(db) == before


async def test_changed_ledger_needs_explicit_accept(pg, tmp_path):
    async with pg() as db:
        before = await state(db)
        result = await safe_apply(db, workbook([row("x")]), tmp_path)
    async with pg() as db:
        await db.execute(update(Transaction).values(memo="edited after import"))
        await db.commit()
        assert (await rb.list_points(db))[0]["changed_tables"] == ["transactions"]
        with pytest.raises(rb.RollbackError) as refused:
            await rb.rollback_upload(db, result.upload_id, accept_changes=False)
        assert (
            refused.value.code == "ledger_changed"
            and refused.value.changed_tables == ["transactions"]
        )
    async with pg() as db:
        assert await db.scalar(select(Transaction.memo)) == "edited after import"
        out = await rb.rollback_upload(db, result.upload_id, accept_changes=True)
        assert out["discarded_changes"] == ["transactions"]
    async with pg() as db:
        assert await state(db) == before


async def test_only_latest_and_then_previous_becomes_undoable(pg, tmp_path):
    async with pg() as db:
        first = await safe_apply(db, workbook([row("one")]), tmp_path)
    async with pg() as db:
        mid = await state(db)
        second = await safe_apply(
            db,
            workbook([row("one"), row("two", -9, seconds=7)]),
            tmp_path,
            day=DAY.replace(day=24),
        )
    async with pg() as db:
        with pytest.raises(rb.RollbackError) as old:
            await rb.rollback_upload(db, first.upload_id, accept_changes=True)
        assert old.value.code == "not_latest"
        await rb.rollback_upload(db, second.upload_id, accept_changes=False)
    async with pg() as db:
        assert await state(db) == mid
        points = {p["upload_id"]: p for p in await rb.list_points(db)}
        assert (
            points[first.upload_id]["can_rollback"]
            and not points[second.upload_id]["can_rollback"]
        )


async def test_failed_apply_leaves_no_point(pg, tmp_path):
    async with pg() as db:
        with pytest.raises(Exception):
            await apply_transaction_upload_workbook(
                db,
                file_bytes=workbook([row("z")]),
                filename="s.xlsx",
                snapshot_date=DAY,
                apply_request=UploadApplyRequest(
                    confirmation=True,
                    selections=[
                        UploadApplySelection(
                            change_type="new",
                            source_row_hash="f" * 64,
                            existing_transaction_id=None,
                        )
                    ],
                ),
                upload_dir=tmp_path / "uploads",
            )
    async with pg() as db:
        assert (
            await db.scalar(select(func.count()).select_from(UploadRollbackPoint)) == 0
        )


async def test_retention_keeps_newest_ten(pg, tmp_path, monkeypatch):
    monkeypatch.setattr(rb, "KEEP_READY", 2)
    ids = []
    for i in range(4):
        async with pg() as db:
            rows = [row(f"r{n}", -(n + 1) * 11, seconds=n) for n in range(i + 1)]
            ids.append(
                (
                    await safe_apply(
                        db, workbook(rows), tmp_path, day=DAY.replace(day=10 + i)
                    )
                ).upload_id
            )
    async with pg() as db:
        rows = (
            await db.execute(
                select(
                    UploadRollbackPoint.upload_log_id,
                    UploadRollbackPoint.status,
                    UploadRollbackPoint.snapshot.is_(None),
                ).order_by(UploadRollbackPoint.id)
            )
        ).all()
        assert [(r[1], r[2]) for r in rows] == [
            ("expired", True),
            ("expired", True),
            ("ready", False),
            ("ready", False),
        ]


async def test_rollback_and_import_are_serialized(pg, tmp_path):
    async with pg() as db:
        first = await safe_apply(db, workbook([row("s")]), tmp_path)

    async def do_rollback():
        async with pg() as db:
            try:
                return await rb.rollback_upload(
                    db, first.upload_id, accept_changes=False
                )
            except rb.RollbackError as exc:
                return exc.code

    async def do_import():
        async with pg() as db:
            return await safe_apply(
                db,
                workbook([row("s"), row("t", -3, seconds=9)]),
                tmp_path,
                day=DAY.replace(day=25),
            )

    results = await asyncio.gather(do_rollback(), do_import())
    async with pg() as db:
        # Either the rollback won (import ran on restored state) or the import won
        # (rollback refused as not latest). Never a half state: fingerprints agree.
        point = await db.scalar(
            select(UploadRollbackPoint)
            .where(UploadRollbackPoint.status == "ready")
            .order_by(UploadRollbackPoint.id.desc())
        )
        assert point.post_fingerprint == await state(db)
        assert results[0] in ("not_latest",) or results[0]["status"] == "rolled_back"


async def test_legacy_upload_creates_point_and_releases_lock(pg, tmp_path):
    async with pg() as db:
        before = await state(db)
        result = await import_transactions_from_workbook(
            db, workbook([row("legacy")], full_snapshots=True), "legacy.xlsx", DAY
        )
        assert result.status == "success"
        held = await db.scalar(
            text(
                "select count(*) from pg_locks where locktype = 'advisory' and objid = :k"
            ),
            {"k": rb.LOCK_KEY % (2**32)},
        )
        assert held == 0
    async with pg() as db:
        await rb.rollback_upload(db, result.upload_id, accept_changes=False)
    async with pg() as db:
        assert await state(db) == before
