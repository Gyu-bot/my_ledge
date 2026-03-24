from dataclasses import dataclass
from datetime import date, datetime
from io import BytesIO

from openpyxl import load_workbook
from sqlalchemy import delete, select
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
        last_transaction = await _get_last_transaction(db_session)
        rows_to_insert = await _filter_new_rows(db_session, parsed_rows, last_transaction)

        db_session.add_all(Transaction(**row) for row in rows_to_insert)
        await db_session.commit()

        tx_new = len(rows_to_insert)
        tx_skipped = len(parsed_rows) - len(rows_to_insert)
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
        tx_total=tx_total,
        tx_new=tx_new,
        tx_skipped=tx_skipped,
        asset_snapshot_count=asset_snapshot_count,
        investment_count=investment_count,
        loan_count=loan_count,
        status=status,
        error_message=error_message,
    )


async def _get_last_transaction(db_session: AsyncSession) -> Transaction | None:
    result = await db_session.execute(
        select(Transaction).order_by(Transaction.date.desc(), Transaction.time.desc()).limit(1)
    )
    return result.scalar_one_or_none()


async def _filter_new_rows(
    db_session: AsyncSession,
    parsed_rows: list[TransactionRow],
    last_transaction: Transaction | None,
) -> list[TransactionRow]:
    if last_transaction is None:
        return parsed_rows

    cursor = datetime.combine(last_transaction.date, last_transaction.time)
    existing_boundary_signatures = await _get_boundary_signatures(
        db_session,
        last_transaction.date,
        last_transaction.time,
    )

    rows_to_insert: list[TransactionRow] = []
    for row in parsed_rows:
        row_dt = datetime.combine(row["date"], row["time"])
        signature = _transaction_signature(row)
        if row_dt > cursor:
            rows_to_insert.append(row)
            continue
        if row_dt == cursor and signature not in existing_boundary_signatures:
            rows_to_insert.append(row)
    return rows_to_insert


async def _get_boundary_signatures(
    db_session: AsyncSession,
    tx_date: date,
    tx_time,
) -> set[tuple[object, ...]]:
    result = await db_session.execute(
        select(Transaction).where(
            Transaction.date == tx_date,
            Transaction.time == tx_time,
        )
    )
    transactions = result.scalars().all()
    return {_transaction_signature(transaction) for transaction in transactions}


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


async def _replace_snapshots(
    db_session: AsyncSession,
    snapshot_date: date,
    parsed_snapshots: SnapshotParseResult,
) -> None:
    normalized_snapshots = _normalize_snapshots_for_storage(parsed_snapshots)

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


def _normalize_snapshots_for_storage(parsed_snapshots: SnapshotParseResult) -> SnapshotParseResult:
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
