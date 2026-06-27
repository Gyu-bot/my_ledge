from dataclasses import dataclass
from datetime import date, time

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.loan_account import LoanAccount
from app.models.loan_transaction_link import LoanTransactionLink
from app.models.transaction import Transaction
from app.models.transaction import TransactionSourceLifecycleStatus
from app.models.upload_log import UploadLog
from app.parsers.transactions import TransactionRow
from app.services.transaction_source_lifecycle_service import (
    TransactionLifecycleReconciliationResult,
    reconcile_transaction_source_lifecycle,
)


@dataclass(frozen=True, slots=True)
class TransactionRowSeed:
    tx_date: date
    tx_time: time
    description: str
    amount: int
    category_major: str
    category_minor: str | None = "기타"
    payment_method: str | None = "체크카드"
    memo: str | None = "원본 메모"


async def test_source_lifecycle_marks_missing_rows_without_deleting(
    db_session: AsyncSession,
) -> None:
    first_rows = [
        build_transaction_row(
            TransactionRowSeed(
                tx_date=date(2026, 3, 1),
                tx_time=time(9, 0),
                description="아침 커피",
                amount=-4500,
                category_major="식비",
            )
        ),
        build_transaction_row(
            TransactionRowSeed(
                tx_date=date(2026, 3, 1),
                tx_time=time(12, 0),
                description="점심 식사",
                amount=-12000,
                category_major="식비",
                payment_method=None,
            )
        ),
    ]
    second_rows = [
        first_rows[0],
        build_transaction_row(
            TransactionRowSeed(
                tx_date=date(2026, 3, 1),
                tx_time=time(13, 0),
                description="오후 간식",
                amount=-3000,
                category_major="식비",
            )
        ),
    ]

    first_result = await run_lifecycle_reconciliation(db_session, first_rows)
    second_result = await run_lifecycle_reconciliation(db_session, second_rows)

    rows = list(
        (
            await db_session.scalars(
                select(Transaction).order_by(
                    Transaction.date.asc(),
                    Transaction.time.asc(),
                    Transaction.id.asc(),
                )
            )
        ).all()
    )
    missing_row = next(row for row in rows if row.description == "점심 식사")
    active_row = next(row for row in rows if row.description == "아침 커피")

    assert first_result.tx_new == 2
    assert second_result.tx_new == 1
    assert second_result.tx_skipped == 1
    assert len(rows) == 3
    assert (
        missing_row.source_lifecycle_status
        == TransactionSourceLifecycleStatus.MISSING_FROM_LATEST_EXPORT.value
    )
    assert missing_row.first_seen_import_id == 1
    assert missing_row.last_seen_import_id == 1
    assert missing_row.source_first_seen_at is not None
    assert missing_row.source_last_seen_at is not None
    assert missing_row.source_row_hash is not None
    assert (
        active_row.source_lifecycle_status
        == TransactionSourceLifecycleStatus.ACTIVE.value
    )
    assert active_row.last_seen_import_id == 2


async def test_source_lifecycle_preserves_user_fields_on_source_change(
    db_session: AsyncSession,
) -> None:
    first_row = build_transaction_row(
        TransactionRowSeed(
            tx_date=date(2026, 3, 2),
            tx_time=time(8, 30),
            description="지하철 정기권",
            amount=-55000,
            category_major="교통",
            category_minor="대중교통",
        )
    )
    changed_row = build_transaction_row(
        TransactionRowSeed(
            tx_date=date(2026, 3, 2),
            tx_time=time(8, 30),
            description="지하철 정기권",
            amount=-55000,
            category_major="생활",
            category_minor="정기권",
        )
    )

    first_result = await run_lifecycle_reconciliation(db_session, [first_row])
    transaction = await db_session.scalar(select(Transaction))
    assert transaction is not None

    account = LoanAccount(lender="테스트은행", product_name="생활대출")
    db_session.add(account)
    await db_session.flush()
    db_session.add(
        LoanTransactionLink(
            transaction_id=transaction.id,
            loan_account_id=account.id,
            repayment_type="mixed",
            memo="연결 유지",
        )
    )
    transaction.category_major_user = "사용자분류"
    transaction.memo = "사용자 메모"
    transaction.merchant = "사용자 거래처"
    first_hash = transaction.source_row_hash
    await db_session.commit()

    second_result = await run_lifecycle_reconciliation(db_session, [changed_row])

    stored = await db_session.scalar(
        select(Transaction).where(Transaction.id == transaction.id)
    )
    stored_link = await db_session.scalar(
        select(LoanTransactionLink).where(
            LoanTransactionLink.transaction_id == transaction.id
        )
    )

    assert first_result.tx_new == 1
    assert second_result.tx_new == 0
    assert second_result.tx_skipped == 1
    assert stored is not None
    assert stored.category_major == "생활"
    assert stored.category_minor == "정기권"
    assert stored.category_major_user == "사용자분류"
    assert stored.memo == "사용자 메모"
    assert stored.merchant == "사용자 거래처"
    assert stored_link is not None
    assert (
        stored.source_lifecycle_status
        == TransactionSourceLifecycleStatus.SOURCE_CHANGED.value
    )
    assert stored.first_seen_import_id == 1
    assert stored.last_seen_import_id == 2
    assert stored.source_first_seen_at is not None
    assert stored.source_last_seen_at is not None
    assert stored.source_row_hash is not None
    assert stored.source_row_hash != first_hash


async def test_source_lifecycle_handles_missing_optional_fields(
    db_session: AsyncSession,
) -> None:
    row = build_transaction_row(
        TransactionRowSeed(
            tx_date=date(2026, 3, 3),
            tx_time=time(7, 45),
            description="현금 인출",
            amount=-10000,
            category_major="이체",
            category_minor=None,
            payment_method=None,
            memo=None,
        )
    )

    await run_lifecycle_reconciliation(db_session, [row])
    second_result = await run_lifecycle_reconciliation(db_session, [row])

    stored = await db_session.scalar(select(Transaction))

    assert second_result.tx_new == 0
    assert second_result.tx_skipped == 1
    assert stored is not None
    assert (
        stored.source_lifecycle_status
        == TransactionSourceLifecycleStatus.ACTIVE.value
    )
    assert stored.source_row_hash is not None


async def run_lifecycle_reconciliation(
    db_session: AsyncSession,
    parsed_rows: list[TransactionRow],
) -> TransactionLifecycleReconciliationResult:
    upload_log = UploadLog(
        filename="lifecycle.xlsx",
        snapshot_date=date(2026, 3, 24),
        status="processing",
    )
    db_session.add(upload_log)
    await db_session.commit()
    await db_session.refresh(upload_log)

    result = await reconcile_transaction_source_lifecycle(
        db_session,
        parsed_rows,
        upload_log,
    )
    await db_session.commit()
    return result


def build_transaction_row(seed: TransactionRowSeed) -> TransactionRow:
    return {
        "date": seed.tx_date,
        "time": seed.tx_time,
        "type": "지출",
        "category_major": seed.category_major,
        "category_minor": seed.category_minor,
        "description": seed.description,
        "merchant": seed.description,
        "amount": seed.amount,
        "currency": "KRW",
        "payment_method": seed.payment_method,
        "memo": seed.memo,
    }
