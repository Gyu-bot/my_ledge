from datetime import date, time
import json

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.installment_plan import InstallmentPlan
from app.models.installment_transaction_link import InstallmentTransactionLink
from app.models.purchase_gate_review import PurchaseGateReview
from app.models.transaction import Transaction
from app.models.transaction import TransactionSourceLifecycleStatus
from app.models.upload_log import UploadLog
from app.parsers.transactions import TransactionRow
from app.schemas.upload import UploadApplyRequest, UploadApplySelection
from app.services import transaction_source_identity
from app.services.upload_apply_service import (
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


async def test_apply_new_rows_creates_transactions_and_upload_log(
    db_session: AsyncSession,
) -> None:
    incoming = [
        build_preview_transaction_row(
            tx_date=date(2026, 3, 24),
            tx_time=time(9, 0),
            description="커피",
            amount=-4500,
            category_major="식비",
        )
    ]

    result = await apply_transaction_upload_from_rows(
        db_session=db_session,
        parsed_rows=incoming,
        filename="finance_sample.xlsx",
        snapshot_date=date(2026, 3, 24),
        apply_request=UploadApplyRequest(
            confirmation=True,
            selections=[
                UploadApplySelection(
                    change_type="new",
                    source_row_hash=transaction_source_identity.source_row_hash_from_row(incoming[0]),
                    existing_transaction_id=None,
                )
            ],
        ),
    )

    transaction = await db_session.scalar(select(Transaction))
    upload_log = await db_session.scalar(select(UploadLog).where(UploadLog.id == result.upload_id))

    assert result.tx_new == 1
    assert result.selected_change_count == 1
    assert result.applied_change_count == 1
    assert transaction is not None
    assert transaction.description == "커피"
    assert transaction.source_lifecycle_status == TransactionSourceLifecycleStatus.ACTIVE.value
    assert upload_log is not None
    assert upload_log.reconciliation_mode == "explicit_apply"


async def test_apply_source_fields_changed_preserves_user_overrides(
    db_session: AsyncSession,
) -> None:
    existing = build_preview_transaction(
        tx_date=date(2026, 3, 25),
        tx_time=time(12, 30),
        description="정류장",
        amount=-1500,
        category_major="교통",
        category_minor="대중교통",
    )
    existing.category_major_user = "사용자카테고리"
    existing.memo = "기록"
    existing.merchant = "사용자상점"
    db_session.add(existing)
    await db_session.commit()

    incoming = [
        build_preview_transaction_row(
            tx_date=date(2026, 3, 25),
            tx_time=time(12, 30),
            description="정류장",
            amount=-1500,
            category_major="생활",
            category_minor="교통",
            payment_method="체크카드",
        )
    ]

    preview = await preview_transaction_upload_from_rows(db_session, incoming)
    assert len(preview.safe_changes) == 1

    source_change = preview.safe_changes[0]
    result = await apply_transaction_upload_from_rows(
        db_session=db_session,
        parsed_rows=incoming,
        filename="finance_sample.xlsx",
        snapshot_date=date(2026, 3, 24),
        apply_request=UploadApplyRequest(
            confirmation=True,
            selections=[
                UploadApplySelection(
                    change_type=source_change.change_type,
                    source_row_hash=source_change.source_row_hash or "",
                    existing_transaction_id=existing.id,
                )
            ],
        ),
    )

    stored = await db_session.scalar(select(Transaction).where(Transaction.id == existing.id))

    assert result.tx_new == 0
    assert result.applied_change_count == 1
    assert stored is not None
    assert stored.category_major == "생활"
    assert stored.category_major_user == "사용자카테고리"
    assert stored.memo == "기록"
    assert stored.merchant == "사용자상점"


async def test_apply_missing_from_latest_export_marks_lifecycle_status(
    db_session: AsyncSession,
) -> None:
    existing = build_preview_transaction(
        tx_date=date(2026, 3, 26),
        tx_time=time(13, 0),
        description="구독",
        amount=-50000,
        category_major="구독",
    )
    db_session.add(existing)
    await db_session.commit()

    incoming = [
        build_preview_transaction_row(
            tx_date=date(2026, 3, 26),
            tx_time=time(14, 0),
            description="새구독",
            amount=-60000,
            category_major="기타",
            category_minor=None,
            payment_method="체크카드",
        )
    ]

    preview = await preview_transaction_upload_from_rows(db_session, incoming)
    missing_change = next(
        change for change in preview.safe_changes if change.change_type == "missing_from_latest_export"
    )

    result = await apply_transaction_upload_from_rows(
        db_session=db_session,
        parsed_rows=incoming,
        filename="finance_sample.xlsx",
        snapshot_date=date(2026, 3, 24),
        apply_request=UploadApplyRequest(
            confirmation=True,
            selections=[
                UploadApplySelection(
                    change_type=missing_change.change_type,
                    source_row_hash=missing_change.source_row_hash or "",
                    existing_transaction_id=missing_change.existing_transaction_id,
                )
            ],
        ),
    )

    updated = await db_session.scalar(
        select(Transaction).where(Transaction.id == existing.id)
    )

    assert result.applied_change_count == 1
    assert updated is not None
    assert (
        updated.source_lifecycle_status
        == TransactionSourceLifecycleStatus.MISSING_FROM_LATEST_EXPORT.value
    )


async def test_possible_replacement_requires_review_and_explicit_apply_supersedes_existing(
    db_session: AsyncSession,
) -> None:
    existing = build_preview_transaction(
        tx_date=date(2026, 3, 29),
        tx_time=time(11, 0),
        description="기존 결제",
        amount=-120000,
        category_major="쇼핑",
        category_minor="가전",
    )
    existing.category_major_user = "사용자대분류"
    existing.category_minor_user = "사용자소분류"
    existing.memo = "사용자 메모"
    existing.merchant = "사용자 거래처"
    existing.spend_necessity = "essential"
    existing.recurring_payment_kind = "installment"
    db_session.add(existing)
    await db_session.flush()

    plan = InstallmentPlan(
        display_name="테스트 할부",
        merchant="테스트상점",
        payment_method="체크카드",
        total_installments=3,
        monthly_amount=40000,
        first_payment_date=date(2026, 3, 1),
    )
    db_session.add(plan)
    await db_session.flush()
    db_session.add(
        InstallmentTransactionLink(
            transaction_id=existing.id,
            installment_plan_id=plan.id,
            installment_number=2,
            source="manual",
            memo="연결 유지",
        )
    )
    db_session.add(
        PurchaseGateReview(
            candidate_key=f"transaction:{existing.id}",
            candidate_type="transaction",
            transaction_id=existing.id,
            review_status="reviewed",
            memo="검토 유지",
        )
    )
    await db_session.commit()

    incoming = [
        build_preview_transaction_row(
            tx_date=date(2026, 3, 29),
            tx_time=time(14, 30),
            description="교체 결제",
            amount=-120000,
            category_major="생활",
            category_minor="리빙",
            payment_method="체크카드",
        )
    ]

    preview = await preview_transaction_upload_from_rows(db_session, incoming)

    assert preview.safe_change_count == 0
    assert preview.review_required_count == 1
    review_change = preview.review_required_changes[0]
    assert review_change.change_type == "possible_replacement"
    assert review_change.review_required is True
    assert review_change.auto_apply_safe is False
    assert review_change.existing_transaction_id == existing.id

    result = await apply_transaction_upload_from_rows(
        db_session=db_session,
        parsed_rows=incoming,
        filename="possible_replacement_apply.xlsx",
        snapshot_date=date(2026, 3, 29),
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

    rows = list(
        (
            await db_session.scalars(
                select(Transaction).order_by(Transaction.id.asc())
            )
        ).all()
    )
    upload_log = await db_session.scalar(select(UploadLog).where(UploadLog.id == result.upload_id))
    existing_after = next(row for row in rows if row.id == existing.id)
    replacement = next(row for row in rows if row.id != existing.id)
    moved_installment_link = await db_session.scalar(
        select(InstallmentTransactionLink).where(
            InstallmentTransactionLink.transaction_id == replacement.id
        )
    )
    old_installment_link = await db_session.scalar(
        select(InstallmentTransactionLink).where(
            InstallmentTransactionLink.transaction_id == existing.id
        )
    )
    review = await db_session.scalar(select(PurchaseGateReview))

    assert result.tx_new == 1
    assert result.tx_skipped == 0
    assert result.applied_change_count == 1
    assert result.applied_changes[0].change_type == "possible_replacement"
    assert len(rows) == 2
    assert (
        existing_after.source_lifecycle_status
        == TransactionSourceLifecycleStatus.SUPERSEDED.value
    )
    assert existing_after.superseded_by_transaction_id == replacement.id
    assert existing_after.description == "기존 결제"
    assert (
        replacement.source_lifecycle_status
        == TransactionSourceLifecycleStatus.ACTIVE.value
    )
    assert replacement.description == "교체 결제"
    assert replacement.category_major == "생활"
    assert replacement.category_minor == "리빙"
    assert replacement.category_major_user == "사용자대분류"
    assert replacement.category_minor_user == "사용자소분류"
    assert replacement.memo == "사용자 메모"
    assert replacement.merchant == "사용자 거래처"
    assert replacement.spend_necessity == "essential"
    assert replacement.recurring_payment_kind == "installment"
    assert replacement.first_seen_import_id == result.upload_id
    assert replacement.last_seen_import_id == result.upload_id
    assert replacement.source_row_hash is not None
    assert old_installment_link is None
    assert moved_installment_link is not None
    assert moved_installment_link.installment_plan_id == plan.id
    assert moved_installment_link.installment_number == 2
    assert moved_installment_link.memo == "연결 유지"
    assert review is not None
    assert review.transaction_id == replacement.id
    assert review.candidate_key == f"transaction:{replacement.id}"
    assert review.review_status == "reviewed"
    assert review.memo == "검토 유지"
    assert upload_log is not None
    assert upload_log.tx_new == 1
    audit_payload = json.loads(upload_log.reconciliation_audit or "{}")
    assert audit_payload["applied_change_count"] == 1
    assert audit_payload["change_type_counts"]["possible_replacement"] == 1
