from datetime import date, datetime, time

from fastapi import HTTPException, status
import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.settlement_group import SettlementMatch
from app.models.transaction import Transaction
from app.schemas.settlement import SettlementMatchUpsertRequest
from app.services.settlement_group_service import build_confirmed_refund_netting_map
from app.services.settlement_match_service import (
    delete_manual_settlement_match,
    upsert_manual_settlement_match,
)


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


async def test_delete_manual_settlement_match_restores_auto_confirmed_match_after_reject_marker_removed(
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
        amount=-150_000,
        payment_method="카드A",
    )
    refund = _transaction(
        tx_date=date(2026, 4, 12),
        tx_time=time(10, 5),
        tx_type="지출",
        category_major="생활",
        category_minor="쇼핑",
        description="환불",
        merchant="상점A",
        amount=150_000,
        payment_method="카드A",
    )
    db_session.add_all([purchase, refund])
    await db_session.commit()

    await upsert_manual_settlement_match(
        db_session,
        settlement_transaction_id=refund.id,
        payload=SettlementMatchUpsertRequest(
            original_transaction_id=purchase.id,
            status="rejected",
        ),
    )

    stored_after_reject = (
        (
            await db_session.execute(
                select(SettlementMatch).order_by(SettlementMatch.id.asc())
            )
        )
        .scalars()
        .all()
    )
    assert [match.status for match in stored_after_reject] == ["rejected"]
    assert await build_confirmed_refund_netting_map(db_session) == {}

    await delete_manual_settlement_match(
        db_session,
        settlement_transaction_id=refund.id,
        original_transaction_id=purchase.id,
    )

    stored_after_delete = (
        (
            await db_session.execute(
                select(SettlementMatch).order_by(SettlementMatch.id.asc())
            )
        )
        .scalars()
        .all()
    )
    assert [match.status for match in stored_after_delete] == ["auto_confirmed"]
    assert await build_confirmed_refund_netting_map(db_session) == {
        purchase.id: 150_000
    }


async def test_upsert_manual_settlement_match_rolls_back_on_persistence_conflict(
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    purchase = _transaction(
        tx_date=date(2026, 4, 10),
        tx_time=time(10, 0),
        tx_type="지출",
        category_major="생활",
        category_minor="쇼핑",
        description="원결제",
        merchant="상점B",
        amount=-90_000,
        payment_method="카드B",
    )
    refund = _transaction(
        tx_date=date(2026, 4, 12),
        tx_time=time(10, 5),
        tx_type="지출",
        category_major="생활",
        category_minor="쇼핑",
        description="환불",
        merchant="상점B",
        amount=90_000,
        payment_method="카드B",
    )
    db_session.add_all([purchase, refund])
    await db_session.commit()

    rollback_called = False

    async def fake_flush() -> None:
        raise IntegrityError(
            "insert into settlement_matches", {}, Exception("conflict")
        )

    async def fake_rollback() -> None:
        nonlocal rollback_called
        rollback_called = True

    monkeypatch.setattr(db_session, "flush", fake_flush)
    monkeypatch.setattr(db_session, "rollback", fake_rollback)

    with pytest.raises(HTTPException) as exc_info:
        await upsert_manual_settlement_match(
            db_session,
            settlement_transaction_id=refund.id,
            payload=SettlementMatchUpsertRequest(
                original_transaction_id=purchase.id,
                status="user_confirmed",
            ),
        )

    assert exc_info.value.status_code == status.HTTP_409_CONFLICT
    assert (
        exc_info.value.detail == "Settlement match conflicts with an existing mapping."
    )
    assert rollback_called is True
