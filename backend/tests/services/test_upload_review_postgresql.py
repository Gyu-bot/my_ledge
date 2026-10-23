"""Opt-in PostgreSQL proof. Uses only a new per-test schema on loopback.

REVIEW_TEST_DATABASE_URL must name the parent's isolated synthetic test server.
No production database, .env, or existing schema contents are read.
"""

import asyncio
import importlib.util
import os
from pathlib import Path
from uuid import uuid4

import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import func, select, text, update
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.models import Base
from app.models.transaction import Transaction
from app.models.upload_log import UploadLog
from app.models.upload_review_operation import UploadReviewOperation
from app.services import upload_review_service as svc
from test_upload_review_service import apply, prepare, row, tx, workbook


@pytest.fixture
async def pg_factory():
    url = os.getenv("REVIEW_TEST_DATABASE_URL")
    if not url:
        pytest.skip("isolated PostgreSQL REVIEW_TEST_DATABASE_URL not supplied")
    parsed = make_url(url)
    assert parsed.host in ("localhost", "127.0.0.1", "::1"), (
        "Only isolated loopback PostgreSQL permitted"
    )
    schema = "review_test_" + uuid4().hex
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


async def test_pg_parallel_prepare_and_exact_once_apply(pg_factory, tmp_path):
    data = workbook()

    async def do_prepare():
        async with pg_factory() as db:
            return await prepare(db, data)

    p, same = await asyncio.gather(do_prepare(), do_prepare())
    assert p.operation_id == same.operation_id

    async def do_apply():
        async with pg_factory() as db:
            return await apply(db, p, tmp_path, data)

    first, second = await asyncio.gather(do_apply(), do_apply())
    assert first.model_dump() == second.model_dump()
    async with pg_factory() as db:
        assert await db.scalar(select(func.count()).select_from(Transaction)) == 1
        assert await db.scalar(select(func.count()).select_from(UploadLog)) == 1


async def test_pg_external_writer_before_prepare_observed(pg_factory):
    async with pg_factory() as seed:
        existing = tx()
        seed.add(existing)
        await seed.commit()
        target = existing.id
    async with pg_factory() as writer, pg_factory() as reviewer:
        await writer.execute(
            update(Transaction)
            .where(Transaction.id == target)
            .values(category_major="writer-before-prepare")
        )
        pending = asyncio.create_task(prepare(reviewer, workbook()))
        await asyncio.sleep(0.15)
        assert not pending.done(), "Prepare must wait for ordinary writer table locks"
        await writer.commit()
        p = await asyncio.wait_for(pending, 5)
        assert p.entries[0].existing_source.category_major == "writer-before-prepare"


async def test_pg_writer_cannot_race_digest_and_apply(
    pg_factory, tmp_path, monkeypatch
):
    data = workbook([row(category_major="source-correction")])
    async with pg_factory() as seed:
        existing = tx()
        seed.add(existing)
        await seed.commit()
        target = existing.id
        p = await prepare(seed, data)
    checked, proceed = asyncio.Event(), asyncio.Event()
    original = svc.state_digest

    async def paused(db):
        result = await original(db)
        checked.set()
        await proceed.wait()
        return result

    monkeypatch.setattr(svc, "state_digest", paused)
    async with pg_factory() as reviewer, pg_factory() as writer:
        pending_apply = asyncio.create_task(apply(reviewer, p, tmp_path, data))
        await asyncio.wait_for(checked.wait(), 5)

        async def ordinary_writer():
            await writer.execute(
                update(Transaction)
                .where(Transaction.id == target)
                .values(memo="writer-after-apply")
            )
            await writer.commit()

        pending_writer = asyncio.create_task(ordinary_writer())
        await asyncio.sleep(0.15)
        assert not pending_writer.done(), (
            "Ordinary writer must be blocked throughout digest-to-commit"
        )
        proceed.set()
        done = await asyncio.wait_for(pending_apply, 5)
        await asyncio.wait_for(pending_writer, 5)
        assert done.status == "applied"
        stored = await writer.get(Transaction, target)
        assert (
            stored.category_major == "source-correction"
            and stored.memo == "writer-after-apply"
        )


async def test_pg_additive_migration_upgrade_downgrade(pg_factory):
    path = (
        Path(__file__).parents[2]
        / "alembic/versions/20261023_0033_upload_review_operations.py"
    )
    spec = importlib.util.spec_from_file_location("review_migration", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    assert migration.down_revision == "20260924_0032"
    async with pg_factory() as db:
        seed = tx()
        db.add(seed)
        await db.commit()
        connection = await db.connection()

        def exercise(conn):
            UploadReviewOperation.__table__.drop(conn)
            with Operations.context(MigrationContext.configure(conn)):
                migration.upgrade()
                assert (
                    conn.scalar(select(func.count()).select_from(UploadReviewOperation))
                    == 0
                )
                assert conn.scalar(select(func.count()).select_from(Transaction)) == 1
                migration.downgrade()
                migration.upgrade()

        await connection.run_sync(exercise)
        await db.commit()
