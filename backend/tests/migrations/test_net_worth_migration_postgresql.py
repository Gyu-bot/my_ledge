"""T061 migration 0039 on real PostgreSQL (synthetic rows only).

Set METRIC_TEST_DATABASE_URL (or REVIEW_TEST_DATABASE_URL) to a disposable
loopback server. Each test creates and drops its own scratch database.
"""

import asyncio
import os
import subprocess
import sys
from collections.abc import Iterator
from datetime import date, time
from pathlib import Path
from uuid import uuid4

import pytest
from sqlalchemy import select, text
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.models.transaction import Transaction
from app.models.transfer_purpose import TransferPurposeOverride
from app.parsers.transactions import TransactionRow
from app.schemas.upload import UploadApplyRequest, UploadApplySelection
from app.services import upload_rollback_service as rb
from app.services.metric_views import FLOW_LINES_VIEW
from app.services.upload_apply_service import apply_transaction_upload_from_rows
from app.services.upload_preview_service import preview_transaction_upload_from_rows

BACKEND_DIR = Path(__file__).resolve().parents[2]
BEFORE_T061 = "20261115_0038"


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
    database = "net_worth_mig_" + uuid4().hex
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


def _catalog(url: str) -> tuple[dict[str, str], set[str]]:
    async def read() -> tuple[dict[str, str], set[str]]:
        engine = create_async_engine(url)
        try:
            async with engine.connect() as connection:
                views = {
                    row.viewname: row.definition
                    for row in await connection.execute(
                        text(
                            "SELECT viewname, pg_get_viewdef(viewname::regclass, true) "
                            "AS definition FROM pg_views WHERE schemaname = 'public'"
                        )
                    )
                }
                tables = {
                    row.tablename
                    for row in await connection.execute(
                        text(
                            "SELECT tablename FROM pg_tables WHERE schemaname = 'public'"
                        )
                    )
                }
        finally:
            await engine.dispose()
        return views, tables

    return asyncio.run(read())


def test_downgrade_restores_0038_views_exactly(scratch_url: str) -> None:
    _alembic(scratch_url, "upgrade", BEFORE_T061)
    views_0038, tables_0038 = _catalog(scratch_url)

    _alembic(scratch_url, "upgrade", "20261116_0039")
    views_head, tables_head = _catalog(scratch_url)
    assert set(views_head) - set(views_0038) == {
        "vw_transfer_purpose",
        "vw_net_worth_snapshots",
        "vw_snapshot_kind_totals",
    }
    assert tables_head - tables_0038 == {
        "transfer_purpose_rules",
        "transfer_purpose_overrides",
    }
    changed = {name for name in views_0038 if views_0038[name] != views_head[name]}
    # Only the two views that gained trailing columns differ.
    assert changed == {"vw_metric_flow_lines", "vw_monthly_flow_summary"}

    _alembic(scratch_url, "downgrade", BEFORE_T061)
    views_down, tables_down = _catalog(scratch_url)
    assert views_down == views_0038
    assert tables_down == tables_0038

    _alembic(scratch_url, "upgrade", "20261116_0039")
    assert _catalog(scratch_url) == (views_head, tables_head)


def test_rollback_restores_transfer_purpose_moved_by_reimport(scratch_url: str) -> None:
    _alembic(scratch_url, "upgrade", "head")

    async def scenario() -> None:
        engine = create_async_engine(scratch_url)
        factory = async_sessionmaker(engine, expire_on_commit=False)
        try:
            async with factory() as db:
                existing = Transaction(
                    date=date(2026, 3, 29),
                    time=time(11, 0),
                    type="이체",
                    category_major="cat-transfer",
                    category_minor=None,
                    description="old-text",
                    merchant="old-text",
                    amount=-500_000,
                    currency="KRW",
                    payment_method="account-a",
                )
                db.add(existing)
                await db.flush()
                db.add(
                    TransferPurposeOverride(
                        transaction_id=existing.id, purpose="investment"
                    )
                )
                await db.commit()
                before = await rb.fingerprint(db)
                incoming: list[TransactionRow] = [
                    {
                        "date": date(2026, 3, 29),
                        "time": time(14, 30),
                        "type": "이체",
                        "category_major": "cat-transfer",
                        "category_minor": None,
                        "description": "new-text",
                        "merchant": "new-text",
                        "amount": -500_000,
                        "currency": "KRW",
                        "payment_method": "account-a",
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
                            FLOW_LINES_VIEW.c.transfer_purpose,
                            FLOW_LINES_VIEW.c.transfer_purpose_source,
                        )
                    )
                ).all()
                assert len(lines) == 1 and lines[0][0] != existing.id
                assert lines[0][1:] == ("investment", "transaction")
                out = await rb.rollback_upload(
                    db, result.upload_id, accept_changes=False
                )
                assert out["restored_counts"]["transfer_purpose_overrides"] == 1
            async with factory() as db:
                assert await rb.fingerprint(db) == before
                restored = await db.get(TransferPurposeOverride, existing.id)
                assert restored is not None and restored.purpose == "investment"
        finally:
            await engine.dispose()

    asyncio.run(scenario())
