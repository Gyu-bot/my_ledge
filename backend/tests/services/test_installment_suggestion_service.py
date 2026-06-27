from datetime import date, datetime, time

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.installment_plan import InstallmentPlan
from app.models.installment_transaction_link import InstallmentTransactionLink
from app.models.transaction import Transaction
from app.services.installment_suggestion_service import (
    list_installment_transaction_suggestions,
)


def _transaction(
    *,
    tx_date: date,
    description: str,
    merchant: str,
    amount: int,
    is_deleted: bool = False,
    merged_into_id: int | None = None,
) -> Transaction:
    now = datetime(2026, 5, 31, 0, 0, 0)
    return Transaction(
        date=tx_date,
        time=time(9, 0),
        type="지출",
        category_major="쇼핑",
        category_minor="전자기기",
        description=description,
        merchant=merchant,
        amount=amount,
        currency="KRW",
        payment_method="카드",
        recurring_payment_kind="installment",
        is_deleted=is_deleted,
        merged_into_id=merged_into_id,
        source="import",
        created_at=now,
        updated_at=now,
    )


async def test_installment_suggestions_score_month_progression_and_conflict(
    db_session: AsyncSession,
) -> None:
    plan = InstallmentPlan(
        display_name="맥북 3개월 할부",
        merchant="애플",
        payment_method="카드",
        total_installments=3,
        monthly_amount=120000,
        first_payment_date=date(2026, 5, 10),
    )
    occupied = _transaction(
        tx_date=date(2026, 6, 9),
        description="애플 기존 연결",
        merchant="애플",
        amount=-120000,
    )
    candidates = [
        _transaction(
            tx_date=date(2026, 5, 10),
            description="애플 결제 1",
            merchant="애플",
            amount=-119500,
        ),
        _transaction(
            tx_date=date(2026, 6, 10),
            description="애플 결제 2",
            merchant="애플",
            amount=-120200,
        ),
        _transaction(
            tx_date=date(2026, 7, 12),
            description="애플 결제 3",
            merchant="애플",
            amount=-120000,
        ),
    ]
    db_session.add_all([plan, occupied, *candidates])
    await db_session.flush()
    db_session.add(
        InstallmentTransactionLink(
            transaction_id=occupied.id,
            installment_plan_id=plan.id,
            installment_number=2,
            source="manual",
        )
    )
    await db_session.commit()

    response = await list_installment_transaction_suggestions(
        db_session,
        installment_plan_id=plan.id,
        page=1,
        per_page=40,
    )

    assert response.total == 3
    assert [item.suggested_installment_number for item in response.items] == [1, 2, 3]
    assert [item.expected_billing_date.isoformat() for item in response.items] == [
        "2026-05-10",
        "2026-06-10",
        "2026-07-10",
    ]
    assert response.items[0].amount_delta == 500
    assert response.items[2].billing_day_delta == 2
    assert response.items[0].confidence == "high"
    assert {"same_merchant", "similar_amount", "same_payment_method"}.issubset(
        set(response.items[0].reason_labels)
    )
    assert response.items[1].is_usable is False
    assert response.items[1].conflict_reason == "installment_number_already_linked"


async def test_installment_suggestions_exclude_unusable_outliers(
    db_session: AsyncSession,
) -> None:
    plan = InstallmentPlan(
        display_name="가전 3개월 할부",
        merchant="가전몰",
        payment_method="카드",
        total_installments=3,
        monthly_amount=100000,
        first_payment_date=date(2026, 5, 10),
    )
    inactive_plan = InstallmentPlan(
        display_name="비활성 할부",
        merchant="가전몰",
        payment_method="카드",
        total_installments=3,
        monthly_amount=100000,
        first_payment_date=date(2026, 5, 10),
        status="completed",
    )
    linked = _transaction(
        tx_date=date(2026, 5, 10),
        description="이미 연결",
        merchant="가전몰",
        amount=-100000,
    )
    deleted = _transaction(
        tx_date=date(2026, 6, 10),
        description="삭제됨",
        merchant="가전몰",
        amount=-100000,
        is_deleted=True,
    )
    parent = _transaction(
        tx_date=date(2026, 6, 11),
        description="병합 대상",
        merchant="병합기준몰",
        amount=-100000,
    )
    outliers = [
        _transaction(
            tx_date=date(2026, 6, 10),
            description="금액 차이 큼",
            merchant="가전몰",
            amount=-150000,
        ),
        _transaction(
            tx_date=date(2026, 6, 20),
            description="청구일 차이 큼",
            merchant="가전몰",
            amount=-100000,
        ),
        _transaction(
            tx_date=date(2026, 9, 10),
            description="범위 밖",
            merchant="가전몰",
            amount=-100000,
        ),
        _transaction(
            tx_date=date(2026, 6, 10),
            description="다른 가맹점",
            merchant="다른몰",
            amount=-100000,
        ),
    ]
    db_session.add_all([plan, inactive_plan, linked, deleted, parent, *outliers])
    await db_session.flush()
    merged = _transaction(
        tx_date=date(2026, 6, 10),
        description="병합됨",
        merchant="가전몰",
        amount=-100000,
        merged_into_id=parent.id,
    )
    db_session.add_all(
        [
            merged,
            InstallmentTransactionLink(
                transaction_id=linked.id,
                installment_plan_id=plan.id,
                installment_number=1,
                source="manual",
            ),
        ]
    )
    await db_session.commit()

    response = await list_installment_transaction_suggestions(
        db_session,
        installment_plan_id=plan.id,
        page=1,
        per_page=40,
    )
    inactive_response = await list_installment_transaction_suggestions(
        db_session,
        installment_plan_id=inactive_plan.id,
        page=1,
        per_page=40,
    )

    assert response.total == 0
    assert response.items == []
    assert inactive_response.total == 0
    assert inactive_response.items == []
