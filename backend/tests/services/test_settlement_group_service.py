from datetime import date, datetime, time

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.transaction import Transaction


def _transaction(
    *,
    tx_date: date,
    tx_time: time,
    tx_type: str,
    category_major: str,
    category_minor: str | None,
    description: str,
    merchant: str | None = None,
    amount: int,
    currency: str = "KRW",
    payment_method: str | None,
) -> Transaction:
    now = datetime(2026, 6, 27, 0, 0, 0)
    return Transaction(
        date=tx_date,
        time=tx_time,
        type=tx_type,
        category_major=category_major,
        category_minor=category_minor,
        description=description,
        merchant=merchant or description,
        amount=amount,
        currency=currency,
        payment_method=payment_method,
        source="import",
        created_at=now,
        updated_at=now,
    )


async def test_reconcile_settlement_matches_auto_confirms_full_cancellation(
    db_session: AsyncSession,
) -> None:
    from app.services.settlement_group_service import (
        build_confirmed_refund_netting_map,
        reconcile_settlement_matches,
    )

    purchase = _transaction(
        tx_date=date(2026, 4, 10),
        tx_time=time(10, 0),
        tx_type="지출",
        category_major="생활",
        category_minor="쇼핑",
        description="헤드폰 구매",
        merchant="상점A",
        amount=-150_000,
        payment_method="카드A",
    )
    refund = _transaction(
        tx_date=date(2026, 4, 12),
        tx_time=time(10, 5),
        tx_type="지출",
        category_major="생활",
        category_minor="쇼핑",
        description="헤드폰 구매 취소",
        merchant="상점A",
        amount=150_000,
        payment_method="카드A",
    )
    db_session.add_all([purchase, refund])
    await db_session.commit()

    groups = await reconcile_settlement_matches(db_session)

    assert len(groups) == 1
    assert groups[0].status == "auto_confirmed"
    assert groups[0].original_transaction_id == purchase.id
    assert groups[0].candidate_original_transaction_ids == (purchase.id,)
    assert groups[0].refund_transaction_ids == (refund.id,)
    assert groups[0].gross_amount == 150_000
    assert groups[0].refund_total == 150_000
    assert groups[0].net_amount == 0
    assert await build_confirmed_refund_netting_map(db_session) == {
        purchase.id: 150_000
    }


async def test_reconcile_settlement_matches_keeps_partial_refund_net_amount(
    db_session: AsyncSession,
) -> None:
    from app.services.settlement_group_service import reconcile_settlement_matches

    purchase = _transaction(
        tx_date=date(2026, 4, 10),
        tx_time=time(10, 0),
        tx_type="지출",
        category_major="생활",
        category_minor="쇼핑",
        description="모니터 구매",
        merchant="상점B",
        amount=-180_000,
        payment_method="카드B",
    )
    refund = _transaction(
        tx_date=date(2026, 4, 12),
        tx_time=time(10, 5),
        tx_type="지출",
        category_major="생활",
        category_minor="쇼핑",
        description="모니터 부분 환불",
        merchant="상점B",
        amount=80_000,
        payment_method="카드B",
    )
    db_session.add_all([purchase, refund])
    await db_session.commit()

    groups = await reconcile_settlement_matches(db_session)

    assert len(groups) == 1
    assert groups[0].status == "auto_confirmed"
    assert groups[0].gross_amount == 180_000
    assert groups[0].refund_total == 80_000
    assert groups[0].net_amount == 100_000
