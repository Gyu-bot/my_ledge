from datetime import date
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.asset_snapshot import AssetSnapshot
from app.services.source_verification import verify_import_parity
from app.services.upload_service import import_transactions_from_workbook


async def test_verify_import_parity_matches_transaction_samples_and_all_snapshots(
    db_session: AsyncSession,
    sample_workbook_bytes: bytes,
) -> None:
    await import_transactions_from_workbook(
        db_session=db_session,
        file_bytes=sample_workbook_bytes,
        filename="finance_sample.xlsx",
        snapshot_date=date(2026, 3, 24),
    )

    report = await verify_import_parity(
        db_session=db_session,
        workbook_bytes=sample_workbook_bytes,
        snapshot_date=date(2026, 3, 24),
        transaction_sample_size=12,
        transaction_sample_seed=20260324,
    )

    assert report.transaction.total_rows == 2219
    assert report.transaction.db_rows == 2219
    assert report.transaction.sample_size == 12
    assert report.transaction.missing_sample_indices == []
    assert report.transaction.sampled_indices == [185, 208, 411, 436, 720, 935, 1024, 1102, 1425, 1466, 1481, 2039]
    assert report.snapshots.asset_snapshots.expected_rows == 45
    assert report.snapshots.asset_snapshots.db_rows == 45
    assert report.snapshots.asset_snapshots.missing_rows == []
    assert report.snapshots.asset_snapshots.extra_rows == []
    assert report.snapshots.investments.expected_rows == 11
    assert report.snapshots.investments.db_rows == 11
    assert report.snapshots.investments.missing_rows == []
    assert report.snapshots.investments.extra_rows == []
    assert report.snapshots.loans.expected_rows == 5
    assert report.snapshots.loans.db_rows == 5
    assert report.snapshots.loans.missing_rows == []
    assert report.snapshots.loans.extra_rows == []


async def test_verify_import_parity_reports_snapshot_mismatch_after_db_tamper(
    db_session: AsyncSession,
    sample_workbook_bytes: bytes,
) -> None:
    await import_transactions_from_workbook(
        db_session=db_session,
        file_bytes=sample_workbook_bytes,
        filename="finance_sample.xlsx",
        snapshot_date=date(2026, 3, 24),
    )

    row = await db_session.scalar(
        select(AssetSnapshot)
        .where(AssetSnapshot.snapshot_date == date(2026, 3, 24))
        .where(AssetSnapshot.product_name == "KB국민ONE통장-저축예금")
    )
    assert row is not None
    row.amount = Decimal("1.00")
    await db_session.commit()

    report = await verify_import_parity(
        db_session=db_session,
        workbook_bytes=sample_workbook_bytes,
        snapshot_date=date(2026, 3, 24),
        transaction_sample_size=5,
        transaction_sample_seed=20260324,
    )

    assert report.transaction.missing_sample_indices == []
    assert len(report.snapshots.asset_snapshots.missing_rows) == 1
    assert len(report.snapshots.asset_snapshots.extra_rows) == 1


async def test_verify_import_parity_accepts_rolling_window_fallback_matches(
    db_session: AsyncSession,
    sample_workbook_bytes: bytes,
    rolling_window_workbook_bytes: bytes,
) -> None:
    await import_transactions_from_workbook(
        db_session=db_session,
        file_bytes=sample_workbook_bytes,
        filename="finance_sample.xlsx",
        snapshot_date=date(2026, 3, 11),
    )
    await import_transactions_from_workbook(
        db_session=db_session,
        file_bytes=rolling_window_workbook_bytes,
        filename="sample_260324.xlsx",
        snapshot_date=date(2026, 3, 24),
    )

    report = await verify_import_parity(
        db_session=db_session,
        workbook_bytes=rolling_window_workbook_bytes,
        snapshot_date=date(2026, 3, 24),
        transaction_sample_size=12,
        transaction_sample_seed=20260324,
    )

    assert report.transaction.missing_sample_indices == []
