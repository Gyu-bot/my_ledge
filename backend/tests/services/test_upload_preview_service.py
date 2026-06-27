from datetime import date, time

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.transaction import Transaction
from app.parsers.transactions import TransactionRow
from app.services.upload_preview_service import preview_transaction_upload_from_rows
from app.services import transaction_source_identity


def build_preview_transaction_row(
    *,
    tx_date: date,
    tx_time: time,
    description: str,
    amount: int,
    category_major: str,
    category_minor: str | None = "기타",
    payment_method: str | None = "체크카드",
    memo: str | None = None,
) -> TransactionRow:
    return {
        "date": tx_date,
        "time": tx_time,
        "type": "지출",
        "category_major": category_major,
        "category_minor": category_minor,
        "description": description,
        "merchant": description,
        "amount": amount,
        "currency": "KRW",
        "payment_method": payment_method,
        "memo": memo,
    }


def preview_seed_transaction(
    *,
    tx_date: date,
    tx_time: time,
    description: str,
    amount: int,
    category_major: str,
    category_minor: str | None = "기타",
    payment_method: str | None = "체크카드",
) -> Transaction:
    return Transaction(
        date=tx_date,
        time=tx_time,
        type="지출",
        category_major=category_major,
        category_minor=category_minor,
        description=description,
        merchant=description,
        amount=amount,
        currency="KRW",
        payment_method=payment_method,
        memo=None,
        source="import",
    )


async def test_preview_upload_with_no_rows_returns_empty_plan(
    db_session: AsyncSession,
) -> None:
    result = await preview_transaction_upload_from_rows(db_session, [])

    assert result.parsed_transaction_count == 0
    assert result.safe_change_count == 0
    assert result.review_required_count == 0
    assert len(result.safe_changes) == 0
    assert len(result.review_required_changes) == 0


async def test_preview_upload_marks_identical_rows_as_unchanged(
    db_session: AsyncSession,
) -> None:
    existing = preview_seed_transaction(
        tx_date=date(2026, 3, 24),
        tx_time=time(9, 0),
        description="카페",
        amount=-5000,
        category_major="식비",
    )
    db_session.add(existing)
    await db_session.commit()

    incoming = [
        build_preview_transaction_row(
            tx_date=date(2026, 3, 24),
            tx_time=time(9, 0),
            description="카페",
            amount=-5000,
            category_major="식비",
        )
    ]

    result = await preview_transaction_upload_from_rows(db_session, incoming)

    assert result.parsed_transaction_count == 1
    assert len(result.safe_changes) == 1
    assert result.safe_changes[0].change_type == "unchanged"
    assert result.safe_changes[0].existing_transaction_id == existing.id
    assert result.safe_changes[0].review_required is False


async def test_preview_upload_marks_category_change_as_source_fields_changed(
    db_session: AsyncSession,
) -> None:
    existing = preview_seed_transaction(
        tx_date=date(2026, 3, 25),
        tx_time=time(10, 0),
        description="택시",
        amount=-12000,
        category_major="교통",
    )
    db_session.add(existing)
    await db_session.commit()

    result = await preview_transaction_upload_from_rows(
        db_session,
        [
            build_preview_transaction_row(
                tx_date=date(2026, 3, 25),
                tx_time=time(10, 0),
                description="택시",
                amount=-12000,
                category_major="생활",
                category_minor="교통",
            )
        ],
    )

    assert len(result.safe_changes) == 1
    change = result.safe_changes[0]
    assert change.change_type == "source_fields_changed"
    assert change.review_required is False
    assert change.auto_apply_safe is True
    assert any(field.field == "category_major" for field in change.field_changes)


async def test_preview_upload_includes_missing_exported_row(
    db_session: AsyncSession,
) -> None:
    existing = preview_seed_transaction(
        tx_date=date(2026, 3, 26),
        tx_time=time(11, 0),
        description="복권",
        amount=-10000,
        category_major="여가",
    )
    db_session.add(existing)
    await db_session.commit()

    result = await preview_transaction_upload_from_rows(
        db_session,
        [
            build_preview_transaction_row(
                tx_date=date(2026, 3, 26),
                tx_time=time(12, 0),
                description="기존행",
                amount=-20000,
                category_major="식비",
            )
        ],
    )
    change_types = {change.change_type for change in result.safe_changes}
    assert result.parsed_transaction_count == 1
    assert "missing_from_latest_export" in change_types
    assert "new" in change_types
    missing_change = next(
        change
        for change in result.safe_changes
        if change.change_type == "missing_from_latest_export"
    )
    assert missing_change.existing_transaction_id == existing.id

    existing_row = await db_session.scalar(select(Transaction).where(Transaction.id == existing.id))
    assert existing_row is not None
    assert (
        transaction_source_identity.source_row_hash_from_transaction(existing_row)
        == missing_change.source_row_hash
    )
