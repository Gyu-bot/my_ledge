from datetime import date

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.transaction import Transaction
from app.models.upload_log import UploadLog
from app.parsers.transactions import parse_transactions
from app.services.upload_service import import_transactions_from_workbook


async def test_import_transactions_inserts_all_rows_on_first_upload(
    db_session: AsyncSession,
    sample_workbook_bytes: bytes,
) -> None:
    result = await import_transactions_from_workbook(
        db_session=db_session,
        file_bytes=sample_workbook_bytes,
        filename="finance_sample.xlsx",
        snapshot_date=date(2026, 3, 24),
    )

    transaction_count = await db_session.scalar(select(func.count()).select_from(Transaction))
    upload_log = await db_session.scalar(select(UploadLog))

    assert result.tx_total == 2219
    assert result.tx_new == 2219
    assert result.tx_skipped == 0
    assert result.status == "success"
    assert transaction_count == 2219
    assert upload_log is not None
    assert upload_log.filename == "finance_sample.xlsx"
    assert upload_log.tx_new == 2219


async def test_import_transactions_skips_rows_already_loaded(
    db_session: AsyncSession,
    sample_workbook_bytes: bytes,
) -> None:
    await import_transactions_from_workbook(
        db_session=db_session,
        file_bytes=sample_workbook_bytes,
        filename="finance_sample.xlsx",
        snapshot_date=date(2026, 3, 24),
    )

    second = await import_transactions_from_workbook(
        db_session=db_session,
        file_bytes=sample_workbook_bytes,
        filename="finance_sample.xlsx",
        snapshot_date=date(2026, 3, 24),
    )

    transaction_count = await db_session.scalar(select(func.count()).select_from(Transaction))

    assert second.tx_total == 2219
    assert second.tx_new == 0
    assert second.tx_skipped == 2219
    assert transaction_count == 2219


async def test_import_transactions_keeps_unseen_rows_at_cursor_boundary(
    db_session: AsyncSession,
    sample_workbook_bytes: bytes,
) -> None:
    seeded_row = parse_transactions_from_bytes(sample_workbook_bytes)[1]
    db_session.add(Transaction(**seeded_row))
    await db_session.commit()

    result = await import_transactions_from_workbook(
        db_session=db_session,
        file_bytes=sample_workbook_bytes,
        filename="finance_sample.xlsx",
        snapshot_date=date(2026, 3, 24),
    )

    matching_rows = await db_session.scalars(
        select(Transaction).where(
            Transaction.date == seeded_row["date"],
            Transaction.time == seeded_row["time"],
        )
    )

    assert result.tx_new == 2
    assert result.tx_skipped == 2217
    assert len(list(matching_rows)) == 2


def parse_transactions_from_bytes(sample_workbook_bytes: bytes) -> list[dict[str, object]]:
    from io import BytesIO

    from openpyxl import load_workbook

    workbook = load_workbook(BytesIO(sample_workbook_bytes), data_only=True)
    return parse_transactions(workbook)
