from dataclasses import dataclass
from datetime import date, datetime
from io import BytesIO

from openpyxl import load_workbook
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.transaction import Transaction
from app.models.upload_log import UploadLog
from app.parsers.decrypt import open_excel_bytes
from app.parsers.transactions import TransactionRow, parse_transactions


@dataclass(slots=True)
class TransactionImportResult:
    tx_total: int
    tx_new: int
    tx_skipped: int
    status: str


async def import_transactions_from_workbook(
    db_session: AsyncSession,
    file_bytes: bytes,
    filename: str,
    snapshot_date: date | None = None,
    excel_password: str | None = None,
) -> TransactionImportResult:
    workbook_buffer = open_excel_bytes(file_bytes, password=excel_password)
    workbook = load_workbook(BytesIO(workbook_buffer.read()), data_only=True)
    parsed_rows = parse_transactions(workbook)

    last_transaction = await _get_last_transaction(db_session)
    rows_to_insert = await _filter_new_rows(db_session, parsed_rows, last_transaction)

    db_session.add_all(Transaction(**row) for row in rows_to_insert)
    upload_log = UploadLog(
        filename=filename,
        snapshot_date=snapshot_date,
        tx_total=len(parsed_rows),
        tx_new=len(rows_to_insert),
        tx_skipped=len(parsed_rows) - len(rows_to_insert),
        status="success",
        error_message=None,
    )
    db_session.add(upload_log)
    await db_session.commit()

    return TransactionImportResult(
        tx_total=len(parsed_rows),
        tx_new=len(rows_to_insert),
        tx_skipped=len(parsed_rows) - len(rows_to_insert),
        status="success",
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
