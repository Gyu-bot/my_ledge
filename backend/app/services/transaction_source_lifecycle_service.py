from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.elements import ColumnElement

from app.models.transaction import Transaction
from app.models.transaction import TransactionSourceLifecycleStatus
from app.models.upload_log import UploadLog
from app.parsers.transactions import TransactionRow
from app.services.transaction_source_identity import FallbackSignature
from app.services.transaction_source_identity import fallback_signature_from_row
from app.services.transaction_source_identity import (
    fallback_signature_from_transaction,
)
from app.services.transaction_source_identity import seconds_since_midnight_from_row
from app.services.transaction_source_identity import (
    seconds_since_midnight_from_transaction,
)
from app.services.transaction_source_identity import source_row_hash_from_row
from app.services.transaction_source_identity import source_row_hash_from_transaction


SOURCE_CHANGED_MATCH_SECONDS = 60


@dataclass(frozen=True, slots=True)
class TransactionLifecycleReconciliationResult:
    tx_new: int
    tx_skipped: int


@dataclass(frozen=True, slots=True)
class LifecycleTouch:
    row_hash: str
    upload_log_id: int
    uploaded_at: datetime
    lifecycle_status: TransactionSourceLifecycleStatus


async def reconcile_transaction_source_lifecycle(
    db_session: AsyncSession,
    parsed_rows: list[TransactionRow],
    upload_log: UploadLog,
) -> TransactionLifecycleReconciliationResult:
    if not parsed_rows:
        return TransactionLifecycleReconciliationResult(tx_new=0, tx_skipped=0)

    window_start, window_end = transaction_window_bounds(parsed_rows)
    existing_rows = await get_imported_transactions_in_window(
        db_session,
        window_start,
        window_end,
    )
    new_transactions, result = _build_reconciliation_plan(
        parsed_rows,
        existing_rows,
        upload_log,
    )
    db_session.add_all(new_transactions)
    return result


async def get_imported_transactions_in_window(
    db_session: AsyncSession,
    window_start: datetime,
    window_end: datetime,
) -> list[Transaction]:
    result = await db_session.execute(
        select(Transaction)
        .where(Transaction.source == "import")
        .where(_transaction_window_clause(window_start, window_end))
        .order_by(Transaction.date, Transaction.time, Transaction.id)
    )
    return list(result.scalars().all())


def transaction_window_bounds(
    parsed_rows: list[TransactionRow],
) -> tuple[datetime, datetime]:
    datetimes = [datetime.combine(row["date"], row["time"]) for row in parsed_rows]
    return min(datetimes), max(datetimes)


def _transaction_window_clause(
    window_start: datetime,
    window_end: datetime,
) -> ColumnElement[bool]:
    return and_(
        or_(
            Transaction.date > window_start.date(),
            and_(
                Transaction.date == window_start.date(),
                Transaction.time >= window_start.time(),
            ),
        ),
        or_(
            Transaction.date < window_end.date(),
            and_(
                Transaction.date == window_end.date(),
                Transaction.time <= window_end.time(),
            ),
        ),
    )


def _build_reconciliation_plan(
    parsed_rows: list[TransactionRow],
    existing_rows: list[Transaction],
    upload_log: UploadLog,
) -> tuple[list[Transaction], TransactionLifecycleReconciliationResult]:
    exact_hash_buckets = _build_source_hash_buckets(existing_rows)

    unmatched_rows: list[TransactionRow] = []
    for row in parsed_rows:
        row_hash = source_row_hash_from_row(row)
        exact_match = _pop_exact_hash_match(exact_hash_buckets, row_hash)
        if exact_match is not None:
            touch_transaction_source_lifecycle(
                exact_match,
                LifecycleTouch(
                    row_hash=row_hash,
                    upload_log_id=upload_log.id,
                    uploaded_at=upload_log.uploaded_at,
                    lifecycle_status=TransactionSourceLifecycleStatus.ACTIVE,
                ),
            )
            continue
        unmatched_rows.append(row)

    remaining_existing_rows = _remaining_hash_bucket_rows(exact_hash_buckets)
    fallback_buckets = _build_fallback_buckets(remaining_existing_rows)
    new_transactions: list[Transaction] = []
    tx_skipped = len(parsed_rows) - len(unmatched_rows)

    for row in unmatched_rows:
        row_hash = source_row_hash_from_row(row)
        fallback_match = _pop_fallback_match(fallback_buckets, row)
        touch = LifecycleTouch(
            row_hash=row_hash,
            upload_log_id=upload_log.id,
            uploaded_at=upload_log.uploaded_at,
            lifecycle_status=TransactionSourceLifecycleStatus.SOURCE_CHANGED,
        )
        if fallback_match is not None:
            apply_source_managed_row_update(fallback_match, row)
            touch_transaction_source_lifecycle(fallback_match, touch)
            tx_skipped += 1
            continue
        new_transactions.append(build_imported_transaction(row, touch))

    for missing_row in _remaining_fallback_rows(fallback_buckets):
        mark_missing_from_latest_export(missing_row)

    result = TransactionLifecycleReconciliationResult(
        tx_new=len(new_transactions),
        tx_skipped=tx_skipped,
    )
    return new_transactions, result


def _build_source_hash_buckets(
    existing_rows: list[Transaction],
) -> dict[str, list[Transaction]]:
    buckets: dict[str, list[Transaction]] = {}
    for row in existing_rows:
        key = source_row_hash_from_transaction(row)
        buckets.setdefault(key, []).append(row)
    for rows in buckets.values():
        rows.sort(key=lambda row: (row.date, row.time, row.id))
    return buckets


def _pop_exact_hash_match(
    exact_hash_buckets: dict[str, list[Transaction]],
    row_hash: str,
) -> Transaction | None:
    candidates = exact_hash_buckets.get(row_hash)
    if not candidates:
        return None
    return candidates.pop(0)


def _remaining_hash_bucket_rows(
    exact_hash_buckets: dict[str, list[Transaction]],
) -> list[Transaction]:
    remaining_rows: list[Transaction] = []
    for rows in exact_hash_buckets.values():
        remaining_rows.extend(rows)
    return remaining_rows


def _build_fallback_buckets(
    existing_rows: list[Transaction],
) -> dict[FallbackSignature, list[Transaction]]:
    buckets: dict[FallbackSignature, list[Transaction]] = {}
    for row in existing_rows:
        key = fallback_signature_from_transaction(row)
        buckets.setdefault(key, []).append(row)
    for rows in buckets.values():
        rows.sort(key=seconds_since_midnight_from_transaction)
    return buckets


def _pop_fallback_match(
    fallback_buckets: dict[FallbackSignature, list[Transaction]],
    row: TransactionRow,
) -> Transaction | None:
    key = fallback_signature_from_row(row)
    candidates = fallback_buckets.get(key)
    if not candidates:
        return None

    row_seconds = seconds_since_midnight_from_row(row)
    best_index: int | None = None
    best_diff: int | None = None
    for index, candidate in enumerate(candidates):
        diff = abs(seconds_since_midnight_from_transaction(candidate) - row_seconds)
        if diff > SOURCE_CHANGED_MATCH_SECONDS:
            continue
        if best_diff is None or diff < best_diff:
            best_index = index
            best_diff = diff

    if best_index is None:
        return None

    return candidates.pop(best_index)


def _remaining_fallback_rows(
    fallback_buckets: dict[FallbackSignature, list[Transaction]],
) -> list[Transaction]:
    remaining_rows: list[Transaction] = []
    for rows in fallback_buckets.values():
        remaining_rows.extend(rows)
    return remaining_rows


def apply_source_managed_row_update(
    transaction: Transaction,
    row: TransactionRow,
) -> None:
    preserve_merchant_override = transaction.merchant != transaction.description
    transaction.date = row["date"]
    transaction.time = row["time"]
    transaction.type = row["type"]
    transaction.category_major = row["category_major"]
    transaction.category_minor = row["category_minor"]
    transaction.description = row["description"]
    transaction.amount = row["amount"]
    transaction.currency = row["currency"]
    transaction.payment_method = row["payment_method"]
    if not preserve_merchant_override:
        transaction.merchant = row["merchant"]


def touch_transaction_source_lifecycle(
    transaction: Transaction,
    touch: LifecycleTouch,
) -> None:
    if transaction.first_seen_import_id is None:
        transaction.first_seen_import_id = touch.upload_log_id
    if transaction.source_first_seen_at is None:
        transaction.source_first_seen_at = touch.uploaded_at
    transaction.source_row_hash = touch.row_hash
    transaction.last_seen_import_id = touch.upload_log_id
    transaction.source_last_seen_at = touch.uploaded_at
    transaction.source_lifecycle_status = touch.lifecycle_status.value


def build_imported_transaction(
    row: TransactionRow,
    touch: LifecycleTouch,
) -> Transaction:
    return Transaction(
        **row,
        source="import",
        source_lifecycle_status=TransactionSourceLifecycleStatus.ACTIVE.value,
        source_row_hash=touch.row_hash,
        first_seen_import_id=touch.upload_log_id,
        last_seen_import_id=touch.upload_log_id,
        source_first_seen_at=touch.uploaded_at,
        source_last_seen_at=touch.uploaded_at,
    )


def mark_missing_from_latest_export(transaction: Transaction) -> None:
    transaction.source_lifecycle_status = (
        TransactionSourceLifecycleStatus.MISSING_FROM_LATEST_EXPORT.value
    )
