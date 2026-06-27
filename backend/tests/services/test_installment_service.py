from datetime import date, datetime, time

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.installment_plan import InstallmentPlan
from app.models.installment_transaction_link import InstallmentTransactionLink
from app.models.transaction import Transaction
from app.services.installment_service import list_installment_transaction_mappings


def _transaction(
    *,
    tx_date: date,
    description: str,
    merchant: str,
    memo: str | None,
    amount: int = -120000,
    payment_method: str | None = "카드",
    recurring_payment_kind: str | None = "installment",
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
        payment_method=payment_method,
        recurring_payment_kind=recurring_payment_kind,
        memo=memo,
        is_deleted=is_deleted,
        merged_into_id=merged_into_id,
        source="import",
        created_at=now,
        updated_at=now,
    )


async def test_list_installment_transaction_mappings_search_matches_transaction_memo(
    db_session: AsyncSession,
) -> None:
    db_session.add_all(
        [
            _transaction(
                tx_date=date(2026, 5, 10),
                description="애플 결제",
                merchant="애플",
                memo="맥북 할부",
            ),
            _transaction(
                tx_date=date(2026, 5, 11),
                description="삼성 결제",
                merchant="삼성",
                memo="다른 메모",
            ),
        ]
    )
    await db_session.commit()

    response = await list_installment_transaction_mappings(
        db_session,
        start_date=None,
        end_date=None,
        search="맥북",
        linked="all",
        installment_plan_id=None,
        page=1,
        per_page=40,
    )

    assert response.total == 1
    assert response.items[0].memo == "맥북 할부"


async def test_list_installment_transaction_mappings_keeps_manual_link_semantics(
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
    linked = _transaction(
        tx_date=date(2026, 5, 10),
        description="애플 결제",
        merchant="애플",
        memo="수동 연결",
    )
    unlinked = _transaction(
        tx_date=date(2026, 6, 10),
        description="애플 결제",
        merchant="애플",
        memo="미연결",
    )
    db_session.add_all([plan, linked, unlinked])
    await db_session.flush()
    db_session.add(
        InstallmentTransactionLink(
            transaction_id=linked.id,
            installment_plan_id=plan.id,
            installment_number=1,
            source="manual",
        )
    )
    await db_session.commit()

    linked_response = await list_installment_transaction_mappings(
        db_session,
        start_date=None,
        end_date=None,
        search=None,
        linked="linked",
        installment_plan_id=None,
        page=1,
        per_page=40,
    )
    unlinked_response = await list_installment_transaction_mappings(
        db_session,
        start_date=None,
        end_date=None,
        search=None,
        linked="unlinked",
        installment_plan_id=None,
        page=1,
        per_page=40,
    )

    assert [item.transaction_id for item in linked_response.items] == [linked.id]
    assert linked_response.items[0].link is not None
    assert linked_response.items[0].link.installment_number == 1
    assert [item.transaction_id for item in unlinked_response.items] == [unlinked.id]
    assert unlinked_response.items[0].link is None
