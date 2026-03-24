from datetime import date
from io import BytesIO

from openpyxl import load_workbook
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.asset_snapshot import AssetSnapshot
from app.models.investment import Investment
from app.models.loan import Loan
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
    asset_snapshot_count = await db_session.scalar(select(func.count()).select_from(AssetSnapshot))
    investment_count = await db_session.scalar(select(func.count()).select_from(Investment))
    loan_count = await db_session.scalar(select(func.count()).select_from(Loan))
    upload_log = await db_session.scalar(select(UploadLog))

    assert result.tx_total == 2219
    assert result.tx_new == 2219
    assert result.tx_skipped == 0
    assert result.asset_snapshot_count == 45
    assert result.investment_count == 11
    assert result.loan_count == 5
    assert result.status == "success"
    assert transaction_count == 2219
    assert asset_snapshot_count == 45
    assert investment_count == 11
    assert loan_count == 5
    assert upload_log is not None
    assert upload_log.filename == "finance_sample.xlsx"
    assert upload_log.tx_new == 2219
    assert upload_log.status == "success"


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


async def test_import_transactions_records_partial_when_snapshot_sheet_is_missing(
    db_session: AsyncSession,
    sample_workbook_bytes: bytes,
) -> None:
    workbook = load_workbook(BytesIO(sample_workbook_bytes), data_only=True)
    del workbook["뱅샐현황"]
    broken_workbook_bytes = BytesIO()
    workbook.save(broken_workbook_bytes)

    result = await import_transactions_from_workbook(
        db_session=db_session,
        file_bytes=broken_workbook_bytes.getvalue(),
        filename="finance_sample.xlsx",
        snapshot_date=date(2026, 3, 24),
    )

    transaction_count = await db_session.scalar(select(func.count()).select_from(Transaction))
    asset_snapshot_count = await db_session.scalar(select(func.count()).select_from(AssetSnapshot))
    upload_log = await db_session.scalar(select(UploadLog))

    assert result.tx_new == 2219
    assert result.asset_snapshot_count == 0
    assert result.investment_count == 0
    assert result.loan_count == 0
    assert result.status == "partial"
    assert transaction_count == 2219
    assert asset_snapshot_count == 0
    assert upload_log is not None
    assert upload_log.status == "partial"
    assert "뱅샐현황" in (upload_log.error_message or "")


async def test_import_transactions_replaces_snapshot_rows_for_same_snapshot_date(
    db_session: AsyncSession,
    sample_workbook_bytes: bytes,
) -> None:
    first_result = await import_transactions_from_workbook(
        db_session=db_session,
        file_bytes=sample_workbook_bytes,
        filename="finance_sample.xlsx",
        snapshot_date=date(2026, 3, 24),
    )
    assert first_result.status == "success"

    workbook = load_workbook(BytesIO(sample_workbook_bytes), data_only=True)
    worksheet = workbook["뱅샐현황"]
    asset_row_index = next(
        index
        for index, row in enumerate(worksheet.iter_rows(values_only=True), start=1)
        if len(row) > 2 and row[2] == "KB국민ONE통장-저축예금"
    )
    worksheet[f"E{asset_row_index}"] = 123456789
    updated_workbook_bytes = BytesIO()
    workbook.save(updated_workbook_bytes)

    second_result = await import_transactions_from_workbook(
        db_session=db_session,
        file_bytes=updated_workbook_bytes.getvalue(),
        filename="finance_sample.xlsx",
        snapshot_date=date(2026, 3, 24),
    )

    asset_snapshot_count = await db_session.scalar(select(func.count()).select_from(AssetSnapshot))
    first_asset_amount = await db_session.scalar(
        select(AssetSnapshot.amount)
        .where(AssetSnapshot.snapshot_date == date(2026, 3, 24))
        .where(AssetSnapshot.side == "asset")
        .where(AssetSnapshot.product_name == "KB국민ONE통장-저축예금")
    )

    assert second_result.tx_new == 0
    assert second_result.asset_snapshot_count == 45
    assert second_result.status == "success"
    assert asset_snapshot_count == 45
    assert first_asset_amount == 123456789


def parse_transactions_from_bytes(sample_workbook_bytes: bytes) -> list[dict[str, object]]:
    workbook = load_workbook(BytesIO(sample_workbook_bytes), data_only=True)
    return parse_transactions(workbook)
