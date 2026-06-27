from datetime import date, datetime, time

from httpx import AsyncClient
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
        currency="KRW",
        payment_method=payment_method,
        is_deleted=is_deleted,
        merged_into_id=merged_into_id,
        source="import",
        created_at=now,
        updated_at=now,
    )


async def test_put_settlement_match_rejects_deleted_participant_confirmation(
    async_client: AsyncClient,
    api_headers: dict[str, str],
    db_session: AsyncSession,
) -> None:
    purchase = _transaction(
        tx_date=date(2026, 4, 10),
        tx_time=time(10, 0),
        tx_type="지출",
        category_major="생활",
        category_minor="쇼핑",
        description="원결제",
        merchant="상점E",
        amount=-90_000,
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
        amount=90_000,
        payment_method="카드E",
        is_deleted=True,
    )
    db_session.add_all([purchase, refund])
    await db_session.commit()

    response = await async_client.put(
        f"/api/v1/transactions/{refund.id}/settlement-match",
        headers=api_headers,
        json={
            "original_transaction_id": purchase.id,
            "status": "user_confirmed",
        },
    )

    assert response.status_code == 422
    assert (
        response.json()["detail"]
        == "Confirmed settlement participants must remain in canonical analytics basis."
    )
