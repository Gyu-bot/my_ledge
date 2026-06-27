import pytest

from datetime import date, time

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.transaction import Transaction
from app.models.upload_log import UploadLog
from app.parsers.transactions import TransactionRow
from app.schemas.upload import UploadApplyRequest, UploadApplySelection
from app.services import upload_apply_service
from app.services.transaction_source_lifecycle_service import LifecycleTouch
from app.services.upload_apply_service import (
    UploadApplySelectionError,
    apply_transaction_upload_from_rows,
)
from app.services.upload_preview_service import preview_transaction_upload_from_rows


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


def build_preview_transaction(
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


async def test_apply_rejects_unknown_selection(
    db_session: AsyncSession,
) -> None:
    incoming = [
        build_preview_transaction_row(
            tx_date=date(2026, 3, 28),
            tx_time=time(15, 0),
            description="없는항목",
            amount=-9000,
            category_major="식비",
        )
    ]

    with pytest.raises(UploadApplySelectionError) as exc:
        await apply_transaction_upload_from_rows(
            db_session=db_session,
            parsed_rows=incoming,
            filename="finance_sample.xlsx",
            snapshot_date=date(2026, 3, 24),
            apply_request=UploadApplyRequest(
                confirmation=True,
                selections=[
                    UploadApplySelection(
                        change_type="new",
                        source_row_hash="wrong",
                        existing_transaction_id=999,
                    )
                ],
            ),
        )

    assert exc.value.selection_index == 0
    assert exc.value.code == "invalid_selection"


async def test_apply_rollback_preserves_atomicity_when_mid_apply_fails(
    monkeypatch: pytest.MonkeyPatch,
    db_session: AsyncSession,
) -> None:
    incoming = [
        build_preview_transaction_row(
            tx_date=date(2026, 3, 27),
            tx_time=time(10, 0),
            description="반환1",
            amount=-3000,
            category_major="식비",
        ),
        build_preview_transaction_row(
            tx_date=date(2026, 3, 27),
            tx_time=time(10, 5),
            description="반환2",
            amount=-4000,
            category_major="식비",
        ),
    ]

    preview = await preview_transaction_upload_from_rows(db_session, incoming)
    assert len(preview.safe_changes) == 2

    original_builder = upload_apply_service.build_imported_transaction
    call_index = 0

    def failing_builder(row: TransactionRow, touch: LifecycleTouch) -> Transaction:
        nonlocal call_index
        call_index += 1
        if call_index == 2:
            raise RuntimeError("mid-apply failure")
        return original_builder(row, touch)

    monkeypatch.setattr(upload_apply_service, "build_imported_transaction", failing_builder)

    before_tx_count = await db_session.scalar(select(func.count()).select_from(Transaction))
    before_log_count = await db_session.scalar(select(func.count()).select_from(UploadLog))

    with pytest.raises(RuntimeError, match="mid-apply failure"):
        await apply_transaction_upload_from_rows(
            db_session=db_session,
            parsed_rows=incoming,
            filename="rollback_mid_failure.xlsx",
            snapshot_date=date(2026, 3, 24),
            apply_request=UploadApplyRequest(
                confirmation=True,
                selections=[
                    UploadApplySelection(
                        change_type=preview.safe_changes[0].change_type,
                        source_row_hash=preview.safe_changes[0].source_row_hash or "",
                        existing_transaction_id=None,
                    ),
                    UploadApplySelection(
                        change_type=preview.safe_changes[1].change_type,
                        source_row_hash=preview.safe_changes[1].source_row_hash or "",
                        existing_transaction_id=None,
                    ),
                ],
            ),
        )

    after_tx_count = await db_session.scalar(select(func.count()).select_from(Transaction))
    after_log_count = await db_session.scalar(select(func.count()).select_from(UploadLog))
    failure_log = await db_session.scalar(
        select(UploadLog).where(UploadLog.filename == "rollback_mid_failure.xlsx")
    )

    assert call_index == 2
    assert after_tx_count == before_tx_count
    assert after_log_count == before_log_count
    assert failure_log is None


async def test_apply_rejects_review_required_ambiguous_without_mutation(
    db_session: AsyncSession,
) -> None:
    first = build_preview_transaction(
        tx_date=date(2026, 3, 27),
        tx_time=time(8, 0),
        description="공통입력",
        amount=-7000,
        category_major="식비",
    )
    second = build_preview_transaction(
        tx_date=date(2026, 3, 27),
        tx_time=time(8, 0, 30),
        description="공통입력",
        amount=-7000,
        category_major="식비",
    )
    db_session.add_all([first, second])
    await db_session.commit()

    incoming = [
        build_preview_transaction_row(
            tx_date=date(2026, 3, 27),
            tx_time=time(8, 0, 15),
            description="공통입력",
            amount=-7000,
            category_major="식비",
        )
    ]

    preview = await preview_transaction_upload_from_rows(db_session, incoming)
    assert preview.review_required_count == 1
    review_change = preview.review_required_changes[0]
    assert review_change.change_type in {"ambiguous", "possible_duplicate"}

    before_tx_count = await db_session.scalar(select(func.count()).select_from(Transaction))
    before_log_count = await db_session.scalar(select(func.count()).select_from(UploadLog))

    with pytest.raises(UploadApplySelectionError) as exc:
        await apply_transaction_upload_from_rows(
            db_session=db_session,
            parsed_rows=incoming,
            filename="review_required_no_mutation.xlsx",
            snapshot_date=date(2026, 3, 24),
            apply_request=UploadApplyRequest(
                confirmation=True,
                selections=[
                    UploadApplySelection(
                        change_type=review_change.change_type,
                        source_row_hash=review_change.source_row_hash or "",
                        existing_transaction_id=review_change.existing_transaction_id,
                    )
                ],
            ),
        )

    after_tx_count = await db_session.scalar(select(func.count()).select_from(Transaction))
    after_log_count = await db_session.scalar(select(func.count()).select_from(UploadLog))
    failure_log = await db_session.scalar(
        select(UploadLog).where(UploadLog.filename == "review_required_no_mutation.xlsx")
    )

    assert exc.value.code == "review_required_selection"
    assert exc.value.selection_index == 0
    assert after_tx_count == before_tx_count
    assert after_log_count == before_log_count
    assert failure_log is None


async def test_apply_rejects_review_required_possible_duplicate_without_mutation(
    db_session: AsyncSession,
) -> None:
    duplicate_row = build_preview_transaction_row(
        tx_date=date(2026, 3, 28),
        tx_time=time(9, 0),
        description="중복행",
        amount=-11000,
        category_major="식비",
    )
    incoming = [duplicate_row, duplicate_row]

    preview = await preview_transaction_upload_from_rows(db_session, incoming)
    assert preview.review_required_count == 1
    review_change = preview.review_required_changes[0]
    assert review_change.change_type == "possible_duplicate"

    before_tx_count = await db_session.scalar(select(func.count()).select_from(Transaction))
    before_log_count = await db_session.scalar(select(func.count()).select_from(UploadLog))

    with pytest.raises(UploadApplySelectionError) as exc:
        await apply_transaction_upload_from_rows(
            db_session=db_session,
            parsed_rows=incoming,
            filename="review_required_duplicate_no_mutation.xlsx",
            snapshot_date=date(2026, 3, 24),
            apply_request=UploadApplyRequest(
                confirmation=True,
                selections=[
                    UploadApplySelection(
                        change_type=review_change.change_type,
                        source_row_hash=review_change.source_row_hash or "",
                        existing_transaction_id=review_change.existing_transaction_id,
                    )
                ],
            ),
        )

    after_tx_count = await db_session.scalar(select(func.count()).select_from(Transaction))
    after_log_count = await db_session.scalar(select(func.count()).select_from(UploadLog))
    failure_log = await db_session.scalar(
        select(UploadLog).where(UploadLog.filename == "review_required_duplicate_no_mutation.xlsx")
    )

    assert exc.value.code == "review_required_selection"
    assert exc.value.selection_index == 0
    assert after_tx_count == before_tx_count
    assert after_log_count == before_log_count
    assert failure_log is None
