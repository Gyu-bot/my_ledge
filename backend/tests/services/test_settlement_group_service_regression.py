from datetime import date, datetime, time

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.settlement_group import SettlementMatch
from app.models.transaction import (
    Transaction,
)
from app.services.transactions_service import list_transactions


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
    is_deleted: bool = False,
    merged_into_id: int | None = None,
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
        is_deleted=is_deleted,
        merged_into_id=merged_into_id,
        source="import",
        created_at=now,
        updated_at=now,
    )


async def test_list_transactions_preserves_raw_signed_amounts_when_refund_exists(
    db_session: AsyncSession,
) -> None:
    purchase = _transaction(
        tx_date=date(2026, 4, 10),
        tx_time=time(10, 0),
        tx_type="지출",
        category_major="생활",
        category_minor="쇼핑",
        description="원결제",
        merchant="상점A",
        amount=-180_000,
        payment_method="카드A",
    )
    refund = _transaction(
        tx_date=date(2026, 4, 12),
        tx_time=time(10, 5),
        tx_type="지출",
        category_major="생활",
        category_minor="쇼핑",
        description="부분 환불",
        merchant="상점A",
        amount=80_000,
        payment_method="카드A",
    )
    db_session.add_all([purchase, refund])
    await db_session.commit()

    response = await list_transactions(
        db_session,
        start_date=None,
        end_date=None,
        tx_type="all",
        source="all",
        category_major=None,
        payment_method=None,
        is_edited="all",
        include_deleted=False,
        include_merged=False,
        search=None,
        cost_kind="all",
        fixed_cost_necessity="all",
        spend_necessity="all",
        recurring_payment_kind="all",
        page=1,
        per_page=40,
    )

    assert response.total == 2
    assert [item.amount for item in response.items] == [80_000, -180_000]


async def test_reconcile_settlement_matches_aggregates_multiple_partial_refunds(
    db_session: AsyncSession,
) -> None:
    from app.services.settlement_group_service import reconcile_settlement_matches

    purchase = _transaction(
        tx_date=date(2026, 4, 10),
        tx_time=time(10, 0),
        tx_type="지출",
        category_major="생활",
        category_minor="쇼핑",
        description="노트북 구매",
        merchant="상점C",
        amount=-200_000,
        payment_method="카드C",
    )
    refund_one = _transaction(
        tx_date=date(2026, 4, 12),
        tx_time=time(10, 5),
        tx_type="지출",
        category_major="생활",
        category_minor="쇼핑",
        description="노트북 1차 환불",
        merchant="상점C",
        amount=30_000,
        payment_method="카드C",
    )
    refund_two = _transaction(
        tx_date=date(2026, 4, 14),
        tx_time=time(10, 10),
        tx_type="지출",
        category_major="생활",
        category_minor="쇼핑",
        description="노트북 2차 환불",
        merchant="상점C",
        amount=20_000,
        payment_method="카드C",
    )
    db_session.add_all([purchase, refund_one, refund_two])
    await db_session.commit()

    groups = await reconcile_settlement_matches(db_session)

    assert len(groups) == 1
    assert groups[0].refund_transaction_ids == (refund_one.id, refund_two.id)
    assert groups[0].refund_total == 50_000
    assert groups[0].net_amount == 150_000


async def test_reconcile_settlement_matches_marks_multiple_candidates_for_review(
    db_session: AsyncSession,
) -> None:
    from app.services.settlement_group_service import reconcile_settlement_matches

    purchase_one = _transaction(
        tx_date=date(2026, 4, 10),
        tx_time=time(10, 0),
        tx_type="지출",
        category_major="생활",
        category_minor="쇼핑",
        description="의자 구매",
        merchant="상점D",
        amount=-100_000,
        payment_method="카드D",
    )
    purchase_two = _transaction(
        tx_date=date(2026, 4, 11),
        tx_time=time(11, 0),
        tx_type="지출",
        category_major="생활",
        category_minor="쇼핑",
        description="의자 재구매",
        merchant="상점D",
        amount=-100_000,
        payment_method="카드D",
    )
    refund = _transaction(
        tx_date=date(2026, 4, 12),
        tx_time=time(10, 5),
        tx_type="지출",
        category_major="생활",
        category_minor="쇼핑",
        description="의자 환불",
        merchant="상점D",
        amount=100_000,
        payment_method="카드D",
    )
    db_session.add_all([purchase_one, purchase_two, refund])
    await db_session.commit()

    groups = await reconcile_settlement_matches(db_session)

    assert len(groups) == 1
    assert groups[0].status == "review_required"
    assert groups[0].original_transaction_id is None
    assert groups[0].candidate_original_transaction_ids == (
        purchase_one.id,
        purchase_two.id,
    )
    stored_matches = (
        (
            await db_session.execute(
                select(SettlementMatch).order_by(SettlementMatch.id.asc())
            )
        )
        .scalars()
        .all()
    )
    assert [match.status for match in stored_matches] == [
        "review_required",
        "review_required",
    ]
