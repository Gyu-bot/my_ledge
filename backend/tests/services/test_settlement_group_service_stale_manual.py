from datetime import date, datetime, time

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.settlement_group import SettlementMatch
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
        currency="KRW",
        payment_method=payment_method,
        source="import",
        created_at=now,
        updated_at=now,
    )


@pytest.mark.parametrize(
    ("original_updates", "settlement_updates"),
    [
        ({"is_deleted": True}, {}),
        ({}, {"is_deleted": True}),
        ({"merged_into_id": 999}, {}),
        ({}, {"merged_into_id": 999}),
    ],
)
async def test_reconcile_settlement_matches_ignores_stale_manual_confirmed_match(
    db_session: AsyncSession,
    original_updates: dict[str, bool | int],
    settlement_updates: dict[str, bool | int],
) -> None:
    from app.services.settlement_group_service import reconcile_settlement_matches

    purchase = _transaction(
        tx_date=date(2026, 4, 10),
        tx_time=time(10, 0),
        tx_type="지출",
        category_major="생활",
        category_minor="쇼핑",
        description="원결제",
        merchant="상점E",
        amount=-120_000,
        payment_method="카드E",
    )
    refund = _transaction(
        tx_date=date(2026, 4, 12),
        tx_time=time(10, 5),
        tx_type="지출",
        category_major="생활",
        category_minor="쇼핑",
        description="환불",
        merchant="상점E",
        amount=120_000,
        payment_method="카드E",
    )
    db_session.add_all([purchase, refund])
    await db_session.commit()
    db_session.add(
        SettlementMatch(
            original_transaction_id=purchase.id,
            settlement_transaction_id=refund.id,
            status="user_confirmed",
            matched_amount=120_000,
        )
    )
    await db_session.commit()
    for field_name, field_value in original_updates.items():
        setattr(purchase, field_name, field_value)
    for field_name, field_value in settlement_updates.items():
        setattr(refund, field_name, field_value)
    await db_session.commit()

    groups = await reconcile_settlement_matches(db_session)
    stored_matches = (
        (
            await db_session.execute(
                select(SettlementMatch).order_by(SettlementMatch.id.asc())
            )
        )
        .scalars()
        .all()
    )

    assert groups == []
    assert [(match.status, match.matched_amount) for match in stored_matches] == [
        ("user_confirmed", 120_000)
    ]
