from datetime import date, datetime, time

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.transaction import Transaction
from app.parsers.transactions import TransactionRow
from app.services.upload_service import import_transactions_from_workbook
from test_upload_service_legacy_helpers import parse_transactions_from_bytes, transaction_conditions


type TransactionReconciliationKey = tuple[
    date,
    time,
    str,
    str | None,
    str,
    int,
    str,
    str | None,
]

type TransactionSignature = tuple[
    date,
    time,
    str,
    str,
    str | None,
    str,
    int,
    str,
    str | None,
    str | None,
]


async def test_import_transactions_reconciles_window_and_keeps_history_outside_latest_range(
    db_session: AsyncSession,
    sample_workbook_bytes: bytes,
    rolling_window_workbook_bytes: bytes,
) -> None:
    await import_transactions_from_workbook(
        db_session=db_session,
        file_bytes=sample_workbook_bytes,
        filename="finance_sample.xlsx",
        snapshot_date=date(2026, 3, 24),
    )

    result = await import_transactions_from_workbook(
        db_session=db_session,
        file_bytes=rolling_window_workbook_bytes,
        filename="sample_260324.xlsx",
        snapshot_date=date(2026, 3, 24),
    )

    existing_transactions = list((await db_session.scalars(select(Transaction))).all())
    previous_rows = parse_transactions_from_bytes(sample_workbook_bytes)
    latest_rows = parse_transactions_from_bytes(rolling_window_workbook_bytes)
    latest_window_start = min(transaction_datetime(row) for row in latest_rows)
    latest_window_end = max(transaction_datetime(row) for row in latest_rows)
    historical_rows_outside_window = [
        row
        for row in previous_rows
        if transaction_datetime(row) < latest_window_start
        or transaction_datetime(row) > latest_window_end
    ]

    assert result.status == "success"
    assert result.tx_total == len(latest_rows)
    assert result.tx_new == 0
    assert result.tx_skipped == len(latest_rows)
    assert len(existing_transactions) == len(historical_rows_outside_window) + len(
        latest_rows
    )


async def test_import_transactions_reconciles_across_real_workbook_chain(
    db_session: AsyncSession,
    sample_workbook_bytes: bytes,
    rolling_window_workbook_bytes: bytes,
    rolling_window_workbook_v2_bytes: bytes,
    latest_workbook_bytes: bytes,
) -> None:
    workbooks = [
        ("finance_sample.xlsx", date(2026, 3, 11), sample_workbook_bytes),
        ("sample_260324.xlsx", date(2026, 3, 24), rolling_window_workbook_bytes),
        ("sample_260326.xlsx", date(2026, 3, 26), rolling_window_workbook_v2_bytes),
        ("sample_260407.xlsx", date(2026, 4, 7), latest_workbook_bytes),
    ]
    expected_rows: list[TransactionRow] = []

    for filename, snapshot_date, workbook_bytes in workbooks:
        parsed_rows = parse_transactions_from_bytes(workbook_bytes)
        expected_rows = reconcile_expected_history(expected_rows, parsed_rows)
        await import_transactions_from_workbook(
            db_session=db_session,
            file_bytes=workbook_bytes,
            filename=filename,
            snapshot_date=snapshot_date,
        )

    existing_transactions = list((await db_session.scalars(select(Transaction))).all())

    assert len(existing_transactions) == len(expected_rows)


async def test_import_transactions_does_not_append_duplicate_when_later_window_only_changes_time_or_category(
    db_session: AsyncSession,
    sample_workbook_bytes: bytes,
    rolling_window_workbook_bytes: bytes,
) -> None:
    if sample_workbook_bytes == rolling_window_workbook_bytes:
        return

    old_rows = parse_transactions_from_bytes(sample_workbook_bytes)
    new_rows = parse_transactions_from_bytes(rolling_window_workbook_bytes)
    old_row, new_row = find_logically_matching_rows_with_changed_exact_signature(
        old_rows, new_rows
    )

    await import_transactions_from_workbook(
        db_session=db_session,
        file_bytes=sample_workbook_bytes,
        filename="finance_sample.xlsx",
        snapshot_date=date(2026, 3, 24),
    )

    existing_row = await db_session.scalar(
        select(Transaction).where(*transaction_conditions(old_row))
    )
    assert existing_row is not None
    existing_row.category_major_user = "사용자수정"
    existing_row.category_minor_user = "세부수정"
    existing_row.memo = "preserve me"
    existing_row.is_deleted = True
    await db_session.commit()

    result = await import_transactions_from_workbook(
        db_session=db_session,
        file_bytes=rolling_window_workbook_bytes,
        filename="sample_260324.xlsx",
        snapshot_date=date(2026, 3, 24),
    )

    appended_row = await db_session.scalar(
        select(Transaction).where(*transaction_conditions(new_row))
    )
    old_row_after_import = await db_session.scalar(
        select(Transaction).where(*transaction_conditions(old_row))
    )

    assert result.tx_new == 68
    assert appended_row is None
    assert old_row_after_import is not None
    assert old_row_after_import.category_major_user == "사용자수정"
    assert old_row_after_import.category_minor_user == "세부수정"
    assert old_row_after_import.memo == "preserve me"
    assert old_row_after_import.is_deleted is True


def reconcile_expected_history(
    existing_rows: list[TransactionRow],
    latest_rows: list[TransactionRow],
) -> list[TransactionRow]:
    if not latest_rows:
        return existing_rows

    window_start = min(transaction_datetime(row) for row in latest_rows)
    window_end = max(transaction_datetime(row) for row in latest_rows)
    preserved_rows = [
        row
        for row in existing_rows
        if transaction_datetime(row) < window_start
        or transaction_datetime(row) > window_end
    ]
    return preserved_rows + latest_rows


def transaction_datetime(row: TransactionRow | Transaction) -> datetime:
    if isinstance(row, Transaction):
        return datetime.combine(row.date, row.time)
    return datetime.combine(row["date"], row["time"])


def transaction_signature(row: TransactionRow | Transaction) -> TransactionSignature:
    if isinstance(row, Transaction):
        return (
            row.date,
            row.time,
            row.type,
            row.category_major,
            row.category_minor,
            row.description,
            row.amount,
            row.currency,
            row.payment_method,
            row.memo,
        )
    return (
        row["date"],
        row["time"],
        row["type"],
        row["category_major"],
        row["category_minor"],
        row["description"],
        row["amount"],
        row["currency"],
        row["payment_method"],
        row["memo"],
    )


def transaction_reconciliation_key(
    row: TransactionRow | Transaction,
) -> TransactionReconciliationKey:
    if isinstance(row, Transaction):
        return (
            row.date,
            row.type,
            row.category_major,
            row.category_minor,
            row.description,
            row.amount,
            row.currency,
            row.payment_method,
        )
    return (
        row["date"],
        row["type"],
        row["category_major"],
        row["category_minor"],
        row["description"],
        row["amount"],
        row["currency"],
        row["payment_method"],
    )


def find_logically_matching_rows_with_changed_exact_signature(
    old_rows: list[TransactionRow],
    new_rows: list[TransactionRow],
) -> tuple[TransactionRow, TransactionRow]:
    old_groups: dict[TransactionReconciliationKey, list[TransactionRow]] = {}
    new_groups: dict[TransactionReconciliationKey, list[TransactionRow]] = {}

    for row in old_rows:
        old_groups.setdefault(transaction_reconciliation_key(row), []).append(row)
    for row in new_rows:
        new_groups.setdefault(transaction_reconciliation_key(row), []).append(row)

    for key in old_groups.keys() & new_groups.keys():
        old_group = sorted(old_groups[key], key=transaction_datetime)
        new_group = sorted(new_groups[key], key=transaction_datetime)
        for old_row, new_row in zip(old_group, new_group):
            if transaction_signature(old_row) != transaction_signature(new_row):
                return old_row, new_row

    raise AssertionError(
        "Expected at least one logical match with changed exact signature"
    )
