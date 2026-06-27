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


async def test_put_settlement_match_requires_api_key_and_preserves_raw_signed_transactions(
    async_client: AsyncClient,
    api_headers: dict[str, str],
    db_session: AsyncSession,
) -> None:
    purchase = _transaction(
        tx_date=date(2026, 1, 31),
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
        tx_date=date(2026, 2, 1),
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

    unauthorized = await async_client.put(
        f"/api/v1/transactions/{refund.id}/settlement-match",
        json={
            "original_transaction_id": purchase.id,
            "status": "user_confirmed",
        },
    )

    assert unauthorized.status_code == 401

    response = await async_client.put(
        f"/api/v1/transactions/{refund.id}/settlement-match",
        headers=api_headers,
        json={
            "original_transaction_id": purchase.id,
            "status": "user_confirmed",
        },
    )

    assert response.status_code == 200
    assert response.json()["status"] == "user_confirmed"
    assert response.json()["original_transaction_id"] == purchase.id
    assert response.json()["settlement_transaction_id"] == refund.id
    assert response.json()["matched_amount"] == 80_000

    analytics_response = await async_client.get(
        "/api/v1/analytics/monthly-cashflow",
        params={"start_date": "2026-01-01", "end_date": "2026-02-28"},
    )

    assert analytics_response.status_code == 200
    assert analytics_response.json()["items"] == [
        {
            "period": "2026-01",
            "income": 0,
            "expense": 100_000,
            "transfer": 0,
            "net_cashflow": -100_000,
            "savings_rate": None,
        }
    ]

    transactions_response = await async_client.get(
        "/api/v1/transactions",
        params={
            "start_date": "2026-01-01",
            "end_date": "2026-02-28",
            "page": 1,
            "per_page": 10,
        },
    )

    assert transactions_response.status_code == 200
    payload = transactions_response.json()
    assert payload["total"] == 2
    assert [item["amount"] for item in payload["items"]] == [80_000, -180_000]
    assert [item["description"] for item in payload["items"]] == ["부분 환불", "원결제"]


async def test_put_settlement_match_rejects_pair_and_keeps_analytics_on_raw_basis(
    async_client: AsyncClient,
    api_headers: dict[str, str],
    db_session: AsyncSession,
) -> None:
    purchase = _transaction(
        tx_date=date(2026, 1, 31),
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
        tx_date=date(2026, 2, 1),
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

    response = await async_client.put(
        f"/api/v1/transactions/{refund.id}/settlement-match",
        headers=api_headers,
        json={
            "original_transaction_id": purchase.id,
            "status": "rejected",
        },
    )

    assert response.status_code == 200
    assert response.json()["status"] == "rejected"

    analytics_response = await async_client.get(
        "/api/v1/analytics/monthly-cashflow",
        params={"start_date": "2026-01-01", "end_date": "2026-02-28"},
    )

    assert analytics_response.status_code == 200
    assert analytics_response.json()["items"] == [
        {
            "period": "2026-01",
            "income": 0,
            "expense": 180_000,
            "transfer": 0,
            "net_cashflow": -180_000,
            "savings_rate": None,
        },
        {
            "period": "2026-02",
            "income": 0,
            "expense": -80_000,
            "transfer": 0,
            "net_cashflow": 80_000,
            "savings_rate": None,
        },
    ]
