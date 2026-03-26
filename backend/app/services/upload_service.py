from collections import Counter
from dataclasses import dataclass
from datetime import date, datetime
from io import BytesIO

from openpyxl import load_workbook
from sqlalchemy import and_, delete, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.asset_snapshot import AssetSnapshot
from app.models.investment import Investment
from app.models.loan import Loan
from app.models.transaction import Transaction
from app.models.upload_log import UploadLog
from app.parsers.decrypt import open_excel_bytes
from app.parsers.snapshots import SnapshotParseResult, parse_snapshots
from app.parsers.transactions import TransactionRow, parse_transactions


@dataclass(slots=True)
class TransactionImportResult:
    upload_id: int
    tx_total: int
    tx_new: int
    tx_skipped: int
    asset_snapshot_count: int
    investment_count: int
    loan_count: int
    status: str
    error_message: str | None = None


async def import_transactions_from_workbook(
    db_session: AsyncSession,
    file_bytes: bytes,
    filename: str,
    snapshot_date: date | None = None,
    excel_password: str | None = None,
) -> TransactionImportResult:
    workbook_buffer = open_excel_bytes(file_bytes, password=excel_password)
    workbook = load_workbook(BytesIO(workbook_buffer.read()), data_only=True)
    effective_snapshot_date = snapshot_date or date.today()

    tx_total = 0
    tx_new = 0
    tx_skipped = 0
    asset_snapshot_count = 0
    investment_count = 0
    loan_count = 0
    tx_success = False
    snapshot_success = False
    errors: list[str] = []

    try:
        parsed_rows = parse_transactions(workbook)
        tx_total = len(parsed_rows)
        rows_to_insert, tx_new, tx_skipped = await _reconcile_transaction_rows(
            db_session,
            parsed_rows,
        )

        db_session.add_all(Transaction(**row) for row in rows_to_insert)
        await db_session.commit()

        tx_success = True
    except Exception as exc:
        await db_session.rollback()
        errors.append(f"transactions: {exc}")

    try:
        parsed_snapshots = parse_snapshots(workbook)
        await _replace_snapshots(db_session, effective_snapshot_date, parsed_snapshots)
        await db_session.commit()

        asset_snapshot_count = len(parsed_snapshots.asset_snapshots)
        investment_count = len(parsed_snapshots.investments)
        loan_count = len(parsed_snapshots.loans)
        snapshot_success = True
    except Exception as exc:
        await db_session.rollback()
        errors.append(f"snapshots: {exc}")

    status = _resolve_status(tx_success=tx_success, snapshot_success=snapshot_success)
    error_message = "\n".join(errors) if errors else None

    upload_log = UploadLog(
        filename=filename,
        snapshot_date=effective_snapshot_date,
        tx_total=tx_total,
        tx_new=tx_new,
        tx_skipped=tx_skipped,
        status=status,
        error_message=error_message,
    )
    db_session.add(upload_log)
    await db_session.commit()

    return TransactionImportResult(
        upload_id=upload_log.id,
        tx_total=tx_total,
        tx_new=tx_new,
        tx_skipped=tx_skipped,
        asset_snapshot_count=asset_snapshot_count,
        investment_count=investment_count,
        loan_count=loan_count,
        status=status,
        error_message=error_message,
    )


async def _reconcile_transaction_rows(
    db_session: AsyncSession,
    parsed_rows: list[TransactionRow],
) -> tuple[list[TransactionRow], int, int]:
    if not parsed_rows:
        return [], 0, 0

    window_start, window_end = _transaction_window_bounds(parsed_rows)
    existing_rows = await _get_imported_transactions_in_window(
        db_session,
        window_start,
        window_end,
    )
    rows_to_insert = _build_rows_to_insert(parsed_rows, existing_rows)
    tx_new = len(rows_to_insert)
    tx_skipped = len(parsed_rows) - tx_new
    return rows_to_insert, tx_new, tx_skipped


async def _get_imported_transactions_in_window(
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


def _transaction_window_bounds(parsed_rows: list[TransactionRow]) -> tuple[datetime, datetime]:
    datetimes = [datetime.combine(row["date"], row["time"]) for row in parsed_rows]
    return min(datetimes), max(datetimes)


def _transaction_window_clause(window_start: datetime, window_end: datetime):
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
        )
    )


def _transaction_comparison_signature(
    row: TransactionRow | Transaction,
) -> tuple[object, ...]:
    return (
        row.date if isinstance(row, Transaction) else row["date"],
        row.time if isinstance(row, Transaction) else row["time"],
        row.type if isinstance(row, Transaction) else row["type"],
        row.category_major if isinstance(row, Transaction) else row["category_major"],
        row.category_minor if isinstance(row, Transaction) else row["category_minor"],
        row.description if isinstance(row, Transaction) else row["description"],
        row.amount if isinstance(row, Transaction) else row["amount"],
        row.currency if isinstance(row, Transaction) else row["currency"],
        row.payment_method if isinstance(row, Transaction) else row["payment_method"],
    )


def _build_rows_to_insert(
    parsed_rows: list[TransactionRow],
    existing_rows: list[Transaction],
) -> list[TransactionRow]:
    existing_counter = Counter(
        _transaction_comparison_signature(row) for row in existing_rows
    )
    existing_by_signature: dict[tuple[object, ...], list[Transaction]] = {}
    for row in existing_rows:
        existing_by_signature.setdefault(_transaction_comparison_signature(row), []).append(row)

    unmatched_rows: list[TransactionRow] = []
    for row in parsed_rows:
        signature = _transaction_comparison_signature(row)
        if existing_counter[signature] > 0:
            existing_counter[signature] -= 1
            continue
        unmatched_rows.append(row)

    remaining_existing_rows = _remaining_existing_rows(
        existing_counter,
        existing_by_signature,
    )
    fallback_buckets = _build_fallback_buckets(remaining_existing_rows)
    rows_to_insert: list[TransactionRow] = []

    for row in unmatched_rows:
        fallback_match = _pop_fallback_match(fallback_buckets, row)
        if fallback_match is not None:
            continue
        rows_to_insert.append(row)

    return rows_to_insert


def _remaining_existing_rows(
    existing_counter: Counter[tuple[object, ...]],
    existing_by_signature: dict[tuple[object, ...], list[Transaction]],
) -> list[Transaction]:
    remaining_rows: list[Transaction] = []
    for signature, count in existing_counter.items():
        if count <= 0:
            continue
        remaining_rows.extend(existing_by_signature[signature][:count])
    return remaining_rows


def _transaction_fallback_signature(
    row: TransactionRow | Transaction,
) -> tuple[object, ...]:
    return (
        row.date if isinstance(row, Transaction) else row["date"],
        row.type if isinstance(row, Transaction) else row["type"],
        row.description if isinstance(row, Transaction) else row["description"],
        row.amount if isinstance(row, Transaction) else row["amount"],
        row.currency if isinstance(row, Transaction) else row["currency"],
        row.payment_method if isinstance(row, Transaction) else row["payment_method"],
    )


def _seconds_since_midnight(row: TransactionRow | Transaction) -> int:
    time_value = row.time if isinstance(row, Transaction) else row["time"]
    return (
        time_value.hour * 3600
        + time_value.minute * 60
        + time_value.second
    )


def _build_fallback_buckets(
    existing_rows: list[Transaction],
) -> dict[tuple[object, ...], list[Transaction]]:
    buckets: dict[tuple[object, ...], list[Transaction]] = {}
    for row in existing_rows:
        key = _transaction_fallback_signature(row)
        buckets.setdefault(key, []).append(row)
    for rows in buckets.values():
        rows.sort(key=_seconds_since_midnight)
    return buckets


def _pop_fallback_match(
    fallback_buckets: dict[tuple[object, ...], list[Transaction]],
    row: TransactionRow,
) -> Transaction | None:
    key = _transaction_fallback_signature(row)
    candidates = fallback_buckets.get(key)
    if not candidates:
        return None

    row_seconds = _seconds_since_midnight(row)
    best_index: int | None = None
    best_diff: int | None = None
    for index, candidate in enumerate(candidates):
        diff = abs(_seconds_since_midnight(candidate) - row_seconds)
        if diff > 60:
            continue
        if best_diff is None or diff < best_diff:
            best_index = index
            best_diff = diff

    if best_index is None:
        return None

    return candidates.pop(best_index)


async def _replace_snapshots(
    db_session: AsyncSession,
    snapshot_date: date,
    parsed_snapshots: SnapshotParseResult,
) -> None:
    normalized_snapshots = normalize_snapshots_for_storage(parsed_snapshots)

    await db_session.execute(
        delete(AssetSnapshot).where(AssetSnapshot.snapshot_date == snapshot_date)
    )
    await db_session.execute(delete(Investment).where(Investment.snapshot_date == snapshot_date))
    await db_session.execute(delete(Loan).where(Loan.snapshot_date == snapshot_date))

    db_session.add_all(
        AssetSnapshot(snapshot_date=snapshot_date, **row)
        for row in normalized_snapshots.asset_snapshots
    )
    db_session.add_all(
        Investment(snapshot_date=snapshot_date, **row)
        for row in normalized_snapshots.investments
    )
    db_session.add_all(
        Loan(snapshot_date=snapshot_date, **row) for row in normalized_snapshots.loans
    )


def _resolve_status(*, tx_success: bool, snapshot_success: bool) -> str:
    if tx_success and snapshot_success:
        return "success"
    if tx_success or snapshot_success:
        return "partial"
    return "failed"


def normalize_snapshots_for_storage(parsed_snapshots: SnapshotParseResult) -> SnapshotParseResult:
    return SnapshotParseResult(
        asset_snapshots=_deduplicate_named_rows(
            parsed_snapshots.asset_snapshots,
            key_fields=("side", "category"),
        ),
        investments=_deduplicate_named_rows(
            parsed_snapshots.investments,
            key_fields=("broker",),
        ),
        loans=_deduplicate_named_rows(
            parsed_snapshots.loans,
            key_fields=("lender",),
        ),
    )


def _deduplicate_named_rows(
    rows: list[dict[str, object]],
    key_fields: tuple[str, ...],
) -> list[dict[str, object]]:
    seen: dict[tuple[object, ...], int] = {}
    normalized_rows: list[dict[str, object]] = []

    for row in rows:
        product_name = str(row["product_name"])
        base_key = tuple(row.get(field) for field in key_fields) + (product_name,)
        occurrence = seen.get(base_key, 0) + 1
        seen[base_key] = occurrence

        if occurrence == 1:
            normalized_rows.append(row)
            continue

        normalized_row = dict(row)
        normalized_row["product_name"] = f"{product_name} ({occurrence})"
        normalized_rows.append(normalized_row)

    return normalized_rows
