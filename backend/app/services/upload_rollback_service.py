"""Undo a BankSalad import by restoring the ledger state captured right before it.

Every import path (web/agent safe apply, reviewed apply, legacy upload) calls
``begin_point`` inside its own transaction before it writes anything, and
``finish_point`` right before its commit, so a failed import leaves no point.
The captured state is the whole ledger except import bookkeeping (upload logs,
review operations and these points), which keeps the restore exact and simple.
Only the newest ready import with no later successful upload can be undone.
PostgreSQL only; other dialects (unit-test SQLite) skip capture.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Base
from app.models.upload_log import UploadLog
from app.models.upload_rollback_point import UploadRollbackPoint

LOCK_KEY = 7_337_291_034  # one advisory lock serializes imports and rollbacks
EXCLUDED_TABLES = frozenset(
    {"upload_logs", "upload_review_operations", "upload_rollback_points"}
)
KEEP_READY = 10
LIVE_UPLOAD_STATUSES = ("success", "partial", "processing")


class RollbackError(ValueError):
    def __init__(self, code, message, status_code=409, changed_tables=None):
        self.code, self.message, self.status_code = code, message, status_code
        self.changed_tables = changed_tables or []
        super().__init__(message)


def scope_tables():
    """Restorable tables in foreign-key dependency order (parents first)."""
    return [t for t in Base.metadata.sorted_tables if t.name not in EXCLUDED_TABLES]


def _enabled(db: AsyncSession) -> bool:
    return db.bind.dialect.name == "postgresql"


def _q(db: AsyncSession, name: str) -> str:
    return db.bind.dialect.identifier_preparer.quote(name)


async def lock(db: AsyncSession) -> None:
    if _enabled(db):
        await db.execute(text("SELECT pg_advisory_xact_lock(:k)"), {"k": LOCK_KEY})


async def lock_session(db: AsyncSession) -> None:
    """For the legacy multi-commit upload: hold the lock across its commits."""
    if _enabled(db):
        await db.execute(text("SELECT pg_advisory_lock(:k)"), {"k": LOCK_KEY})


async def unlock_session(db: AsyncSession) -> None:
    # A session lock outlives transactions and pooled connections: always release.
    if _enabled(db):
        try:
            await db.execute(text("SELECT pg_advisory_unlock(:k)"), {"k": LOCK_KEY})
        except Exception:
            await db.rollback()
            await db.execute(text("SELECT pg_advisory_unlock(:k)"), {"k": LOCK_KEY})
        await db.commit()


def _fingerprint_sql(db, sources):
    # Row text via to_jsonb: identical for live rows and rows rebuilt from JSON.
    parts = [
        f"SELECT '{name}' AS t, count(*) AS n, "
        "md5(coalesce(string_agg(to_jsonb(x)::text, chr(10) "
        f"ORDER BY to_jsonb(x)::text), '')) AS h FROM {source} x"
        for name, source in sources
    ]
    return " UNION ALL ".join(parts)


async def fingerprint(db: AsyncSession) -> dict:
    sql = _fingerprint_sql(db, [(t.name, _q(db, t.name)) for t in scope_tables()])
    return {t: [n, h] for t, n, h in (await db.execute(text(sql))).all()}


async def snapshot_fingerprint(db: AsyncSession, point_id: int) -> dict:
    sources = [
        (
            t.name,
            f"jsonb_populate_recordset(NULL::{_q(db, t.name)}, "
            f"(SELECT coalesce(snapshot->'{t.name}', '[]'::jsonb) "
            f"FROM upload_rollback_points WHERE id = {int(point_id)}))",
        )
        for t in scope_tables()
    ]
    return {
        t: [n, h]
        for t, n, h in (await db.execute(text(_fingerprint_sql(db, sources)))).all()
    }


async def begin_point(db: AsyncSession, upload_log_id: int | None = None) -> int | None:
    """Capture the pre-import ledger in the caller's transaction (lock held)."""
    if not _enabled(db):
        return None
    await lock(db)
    tables = scope_tables()
    document = (
        "jsonb_build_object("
        + ", ".join(
            f"'{t.name}', (SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) "
            f"FROM {_q(db, t.name)} x)"
            for t in tables
        )
        + ")"
    )
    point_id = await db.scalar(
        text(
            "INSERT INTO upload_rollback_points (upload_log_id, status, snapshot) "
            f"SELECT :log, 'pending', {document} RETURNING id"
        ),
        {"log": upload_log_id},
    )
    pre = await snapshot_fingerprint(db, point_id)
    await db.execute(
        text(
            "UPDATE upload_rollback_points SET pre_fingerprint = CAST(:fp AS jsonb) "
            "WHERE id = :id"
        ),
        {"fp": json.dumps(pre), "id": point_id},
    )
    return point_id


async def finish_point(
    db: AsyncSession, point_id: int | None, upload_log_id: int
) -> None:
    """Record the post-import state just before the import commits."""
    if point_id is None:
        return
    post = await fingerprint(db)
    await db.execute(
        text(
            "UPDATE upload_rollback_points SET upload_log_id = :log, status = 'ready', "
            "post_fingerprint = CAST(:fp AS jsonb) WHERE id = :id"
        ),
        {"log": upload_log_id, "fp": json.dumps(post), "id": point_id},
    )
    await db.execute(
        text(
            "UPDATE upload_rollback_points SET snapshot = NULL, status = 'expired' "
            "WHERE status = 'ready' AND id NOT IN (SELECT id FROM upload_rollback_points "
            "WHERE status = 'ready' ORDER BY id DESC LIMIT :keep)"
        ),
        {"keep": KEEP_READY},
    )


async def _candidate(db: AsyncSession) -> UploadRollbackPoint | None:
    point = await db.scalar(
        select(UploadRollbackPoint)
        .where(UploadRollbackPoint.status == "ready")
        .order_by(UploadRollbackPoint.id.desc())
        .limit(1)
    )
    if point is None or point.upload_log_id is None:
        return None
    later = await db.scalar(
        select(UploadLog.id)
        .where(
            UploadLog.id > point.upload_log_id,
            UploadLog.status.in_(LIVE_UPLOAD_STATUSES),
        )
        .limit(1)
    )
    return None if later is not None else point


def changed_tables(expected: dict | None, current: dict) -> list[str]:
    if expected is None:
        return sorted(current)
    return sorted(
        t for t in set(expected) | set(current) if expected.get(t) != current.get(t)
    )


async def list_points(db: AsyncSession, limit: int = 20) -> list[dict]:
    if not _enabled(db):
        return []
    candidate = await _candidate(db)
    changed = (
        changed_tables(candidate.post_fingerprint, await fingerprint(db))
        if candidate is not None
        else []
    )
    rows = (
        await db.execute(
            select(UploadRollbackPoint, UploadLog)
            .join(UploadLog, UploadLog.id == UploadRollbackPoint.upload_log_id)
            .order_by(UploadRollbackPoint.id.desc())
            .limit(limit)
        )
    ).all()
    return [
        {
            "upload_id": log.id,
            "created_at": point.created_at,
            "status": point.status,
            "snapshot_date": log.snapshot_date,
            "filename": log.filename,
            "can_rollback": candidate is not None and point.id == candidate.id,
            "changed_tables": changed
            if candidate is not None and point.id == candidate.id
            else [],
        }
        for point, log in rows
    ]


async def rollback_upload(
    db: AsyncSession, upload_id: int, *, accept_changes: bool
) -> dict:
    if not _enabled(db):
        raise RollbackError("unsupported_database", "Rollback requires PostgreSQL", 503)
    try:
        await lock(db)
        await db.execute(text("SET LOCAL lock_timeout = '10s'"))
        tables = scope_tables()
        await db.execute(
            text(
                "LOCK TABLE "
                + ", ".join(_q(db, t.name) for t in tables)
                + " IN ACCESS EXCLUSIVE MODE"
            )
        )
        point = await db.scalar(
            select(UploadRollbackPoint)
            .where(UploadRollbackPoint.upload_log_id == upload_id)
            .with_for_update()
        )
        if point is None:
            raise RollbackError(
                "unknown_rollback_point", "No rollback point for this upload", 404
            )
        candidate = await _candidate(db)
        if candidate is None or candidate.id != point.id:
            raise RollbackError(
                "not_latest",
                "Only the newest import without a later upload can be undone",
            )
        missing = [t.name for t in tables if t.name not in (point.snapshot or {})]
        if missing:
            raise RollbackError(
                "schema_changed",
                "The ledger schema changed after this import",
                409,
                missing,
            )
        changed = changed_tables(point.post_fingerprint, await fingerprint(db))
        if changed and not accept_changes:
            raise RollbackError(
                "ledger_changed",
                "The ledger changed after this import; confirm to discard those changes",
                409,
                changed,
            )
        expected = await snapshot_fingerprint(db, point.id)
        await db.execute(text("TRUNCATE " + ", ".join(_q(db, t.name) for t in tables)))
        for t in tables:  # parents first; self references resolve per statement
            name = _q(db, t.name)
            await db.execute(
                text(
                    f"INSERT INTO {name} SELECT * FROM jsonb_populate_recordset("
                    f"NULL::{name}, (SELECT snapshot->'{t.name}' "
                    "FROM upload_rollback_points WHERE id = :id))"
                ),
                {"id": point.id},
            )
        restored = await fingerprint(db)
        if restored != expected:
            raise RollbackError(
                "restore_mismatch",
                "Restored ledger differs from the captured state",
                500,
            )
        point.status = "rolled_back"
        point.snapshot = None
        point.rolled_back_at = datetime.now(timezone.utc)
        log = await db.get(UploadLog, upload_id)
        log.status = "rolled_back"
        result = {
            "upload_id": upload_id,
            "status": "rolled_back",
            "discarded_changes": changed,
            "restored_counts": {t: v[0] for t, v in restored.items()},
        }
        await db.commit()
        return result
    except Exception:
        await db.rollback()
        raise
