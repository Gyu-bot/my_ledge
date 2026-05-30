from datetime import date, datetime, time

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.transaction import Transaction
from app.services.installment_service import list_installment_transaction_mappings


def _transaction(
    *,
    tx_date: date,
    description: str,
    merchant: str,
    memo: str | None,
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
        amount=-120000,
        currency="KRW",
        payment_method="카드",
        recurring_payment_kind="installment",
        memo=memo,
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
