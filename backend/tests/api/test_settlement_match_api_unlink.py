from datetime import date, datetime, time

from httpx import AsyncClient
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


async def test_delete_settlement_match_removes_manual_override_and_restores_review_required_candidates(
    async_client: AsyncClient,
    api_headers: dict[str, str],
    db_session: AsyncSession,
) -> None:
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

    create_response = await async_client.put(
        f"/api/v1/transactions/{refund.id}/settlement-match",
        headers=api_headers,
        json={
            "original_transaction_id": purchase_one.id,
            "status": "user_confirmed",
        },
    )
    assert create_response.status_code == 200

    delete_response = await async_client.delete(
        f"/api/v1/transactions/{refund.id}/settlement-match",
        headers=api_headers,
        params={"original_transaction_id": purchase_one.id},
    )

    assert delete_response.status_code == 204
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
    assert {match.original_transaction_id for match in stored_matches} == {
        purchase_one.id,
        purchase_two.id,
    }


async def test_delete_settlement_match_ignores_stale_manual_match_elsewhere(
    async_client: AsyncClient,
    api_headers: dict[str, str],
    db_session: AsyncSession,
) -> None:
    stale_purchase = _transaction(
        tx_date=date(2026, 2, 10),
        tx_time=time(10, 0),
        tx_type="지출",
        category_major="생활",
        category_minor="쇼핑",
        description="이전 원결제",
        merchant="상점E",
        amount=-120_000,
        payment_method="카드E",
    )
    stale_refund = _transaction(
        tx_date=date(2026, 2, 12),
        tx_time=time(10, 5),
        tx_type="지출",
        category_major="생활",
        category_minor="쇼핑",
        description="이전 환불",
        merchant="상점E",
        amount=120_000,
        payment_method="카드E",
    )
    active_purchase = _transaction(
        tx_date=date(2026, 3, 10),
        tx_time=time(11, 0),
        tx_type="지출",
        category_major="생활",
        category_minor="쇼핑",
        description="새 원결제",
        merchant="상점F",
        amount=-90_000,
        payment_method="카드F",
    )
    active_refund = _transaction(
        tx_date=date(2026, 3, 12),
        tx_time=time(11, 5),
        tx_type="지출",
        category_major="생활",
        category_minor="쇼핑",
        description="새 환불",
        merchant="상점F",
        amount=90_000,
        payment_method="카드F",
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

    active_reject = await async_client.put(
        f"/api/v1/transactions/{active_refund.id}/settlement-match",
        headers=api_headers,
        json={
            "original_transaction_id": active_purchase.id,
            "status": "rejected",
        },
    )
    assert active_reject.status_code == 200

    stale_refund.is_deleted = True
    await db_session.commit()

    delete_response = await async_client.delete(
        f"/api/v1/transactions/{active_refund.id}/settlement-match",
        headers=api_headers,
        params={"original_transaction_id": active_purchase.id},
    )

    assert delete_response.status_code == 204
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
        "user_confirmed",
        "auto_confirmed",
    ]
