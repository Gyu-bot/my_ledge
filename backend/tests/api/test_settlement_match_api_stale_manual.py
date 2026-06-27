from datetime import date, datetime, time

from httpx import AsyncClient
import pytest
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


@pytest.mark.parametrize("status", ["user_confirmed", "rejected"])
async def test_put_settlement_match_ignores_stale_manual_match_elsewhere(
    async_client: AsyncClient,
    api_headers: dict[str, str],
    db_session: AsyncSession,
    status: str,
) -> None:
    stale_purchase = _transaction(
        tx_date=date(2026, 2, 10),
        tx_time=time(10, 0),
        tx_type="지출",
        category_major="생활",
        category_minor="쇼핑",
        description="이전 원결제",
        merchant="상점B",
        amount=-120_000,
        payment_method="카드B",
    )
    stale_refund = _transaction(
        tx_date=date(2026, 2, 12),
        tx_time=time(10, 5),
        tx_type="지출",
        category_major="생활",
        category_minor="쇼핑",
        description="이전 환불",
        merchant="상점B",
        amount=120_000,
        payment_method="카드B",
    )
    active_purchase = _transaction(
        tx_date=date(2026, 3, 10),
        tx_time=time(11, 0),
        tx_type="지출",
        category_major="생활",
        category_minor="쇼핑",
        description="새 원결제",
        merchant="상점C",
        amount=-90_000,
        payment_method="카드C",
    )
    active_refund = _transaction(
        tx_date=date(2026, 3, 12),
        tx_time=time(11, 5),
        tx_type="지출",
        category_major="생활",
        category_minor="쇼핑",
        description="새 환불",
        merchant="상점C",
        amount=90_000,
        payment_method="카드C",
    )
    db_session.add_all([stale_purchase, stale_refund, active_purchase, active_refund])
    await db_session.commit()

    stale_confirm = await async_client.put(
        f"/api/v1/transactions/{stale_refund.id}/settlement-match",
        headers=api_headers,
        json={
            "original_transaction_id": stale_purchase.id,
            "status": "user_confirmed",
        },
    )
    assert stale_confirm.status_code == 200

    stale_refund.is_deleted = True
    await db_session.commit()

    response = await async_client.put(
        f"/api/v1/transactions/{active_refund.id}/settlement-match",
        headers=api_headers,
        json={
            "original_transaction_id": active_purchase.id,
            "status": status,
        },
    )

    assert response.status_code == 200
    assert response.json()["status"] == status
    assert response.json()["original_transaction_id"] == active_purchase.id
    assert response.json()["settlement_transaction_id"] == active_refund.id


@pytest.mark.parametrize(
    ("stale_refund_updates", "stale_refund_marker"),
    [
        ({"is_deleted": True}, "deleted"),
        ({"merged_into_id": 9_999}, "merged"),
    ],
)
async def test_put_settlement_match_releases_same_original_capacity_from_stale_refund(
    async_client: AsyncClient,
    api_headers: dict[str, str],
    db_session: AsyncSession,
    stale_refund_updates: dict[str, bool | int],
    stale_refund_marker: str,
) -> None:
    purchase = _transaction(
        tx_date=date(2026, 4, 10),
        tx_time=time(9, 0),
        tx_type="지출",
        category_major="생활",
        category_minor="쇼핑",
        description="원결제",
        merchant="상점D",
        amount=-100_000,
        payment_method="카드D",
    )
    stale_refund = _transaction(
        tx_date=date(2026, 4, 12),
        tx_time=time(9, 5),
        tx_type="지출",
        category_major="생활",
        category_minor="쇼핑",
        description="이전 환불",
        merchant="상점D",
        amount=100_000,
        payment_method="카드D",
    )
    later_refund = _transaction(
        tx_date=date(2026, 4, 14),
        tx_time=time(9, 10),
        tx_type="지출",
        category_major="생활",
        category_minor="쇼핑",
        description="나중 환불",
        merchant="상점D",
        amount=100_000,
        payment_method="카드D",
    )
    db_session.add_all([purchase, stale_refund, later_refund])
    await db_session.commit()

    stale_confirm = await async_client.put(
        f"/api/v1/transactions/{stale_refund.id}/settlement-match",
        headers=api_headers,
        json={
            "original_transaction_id": purchase.id,
            "status": "user_confirmed",
        },
    )
    assert stale_confirm.status_code == 200

    for field_name, field_value in stale_refund_updates.items():
        setattr(stale_refund, field_name, field_value)
    await db_session.commit()

    response = await async_client.put(
        f"/api/v1/transactions/{later_refund.id}/settlement-match",
        headers=api_headers,
        json={
            "original_transaction_id": purchase.id,
            "status": "user_confirmed",
        },
    )

    assert response.status_code == 200, stale_refund_marker
    assert response.json()["status"] == "user_confirmed"
    assert response.json()["original_transaction_id"] == purchase.id
    assert response.json()["settlement_transaction_id"] == later_refund.id
    assert response.json()["matched_amount"] == 100_000
