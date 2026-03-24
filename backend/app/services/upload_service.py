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
    tx_new, tx_skipped = _calculate_transaction_delta(parsed_rows, existing_rows)
    reconciled_rows = _build_reconciled_transaction_rows(parsed_rows, existing_rows)

    await db_session.execute(
        delete(Transaction)
        .where(Transaction.source == "import")
        .where(_transaction_window_clause(window_start, window_end))
    )

    return reconciled_rows, tx_new, tx_skipped


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


def _transaction_signature(row: TransactionRow | Transaction) -> tuple[object, ...]:
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
        row.memo if isinstance(row, Transaction) else row["memo"],
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


def _transaction_reconciliation_key(
    row: TransactionRow | Transaction,
) -> tuple[object, ...]:
    return (
        row.date if isinstance(row, Transaction) else row["date"],
        row.type if isinstance(row, Transaction) else row["type"],
        row.category_major if isinstance(row, Transaction) else row["category_major"],
        row.category_minor if isinstance(row, Transaction) else row["category_minor"],
        row.description if isinstance(row, Transaction) else row["description"],
        row.amount if isinstance(row, Transaction) else row["amount"],
        row.currency if isinstance(row, Transaction) else row["currency"],
        row.payment_method if isinstance(row, Transaction) else row["payment_method"],
    )


def _calculate_transaction_delta(
    parsed_rows: list[TransactionRow],
    existing_rows: list[Transaction],
) -> tuple[int, int]:
    parsed_counter = Counter(_transaction_comparison_signature(row) for row in parsed_rows)
    existing_counter = Counter(_transaction_comparison_signature(row) for row in existing_rows)
    tx_new = sum((parsed_counter - existing_counter).values())
    tx_total = len(parsed_rows)
    return tx_new, tx_total - tx_new


def _build_reconciled_transaction_rows(
    parsed_rows: list[TransactionRow],
    existing_rows: list[Transaction],
) -> list[TransactionRow]:
    existing_groups: dict[tuple[object, ...], list[Transaction]] = {}
    parsed_groups: dict[tuple[object, ...], list[TransactionRow]] = {}

    for row in existing_rows:
        existing_groups.setdefault(_transaction_reconciliation_key(row), []).append(row)
    for row in parsed_rows:
        parsed_groups.setdefault(_transaction_reconciliation_key(row), []).append(row)

    for rows in existing_groups.values():
        rows.sort(key=_transaction_sort_key)
    for rows in parsed_groups.values():
        rows.sort(key=_transaction_sort_key)

    reconciled_rows: list[TransactionRow] = []
    for key, rows in parsed_groups.items():
        existing_group = existing_groups.get(key, [])
        for index, row in enumerate(rows):
            reconciled_row = dict(row)
            if index < len(existing_group):
                _preserve_editable_transaction_fields(reconciled_row, existing_group[index])
            reconciled_rows.append(reconciled_row)

    return reconciled_rows


def _transaction_sort_key(row: TransactionRow | Transaction) -> tuple[object, ...]:
    if isinstance(row, Transaction):
        return (row.time,)
    return (row["time"],)


def _preserve_editable_transaction_fields(
    row: TransactionRow,
    existing_row: Transaction,
) -> None:
    row["category_major_user"] = existing_row.category_major_user
    row["category_minor_user"] = existing_row.category_minor_user
    row["memo"] = existing_row.memo
    row["is_deleted"] = existing_row.is_deleted
    row["merged_into_id"] = existing_row.merged_into_id


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
