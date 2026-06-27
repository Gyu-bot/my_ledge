from datetime import date, datetime, time

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.settlement_group import SettlementMatch, SettlementMatchStatus
from app.models.transaction import Transaction, TransactionSourceLifecycleStatus


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
    source_lifecycle_status: str = TransactionSourceLifecycleStatus.ACTIVE.value,
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
        source_lifecycle_status=source_lifecycle_status,
        is_deleted=is_deleted,
        merged_into_id=merged_into_id,
        source="import",
        created_at=now,
        updated_at=now,
    )


async def _stored_matches(db_session: AsyncSession) -> list[SettlementMatch]:
    return (
        (
            await db_session.execute(
                select(SettlementMatch).order_by(SettlementMatch.id.asc())
            )
        )
        .scalars()
        .all()
    )


async def test_reconcile_settlement_matches_excludes_non_active_purchase_candidates(
    db_session: AsyncSession,
) -> None:
    from app.services.settlement_group_service import reconcile_settlement_matches

    stale_purchase = _transaction(
        tx_date=date(2026, 4, 10),
        tx_time=time(10, 0),
        tx_type="지출",
        category_major="생활",
        category_minor="쇼핑",
        description="이어폰 구매",
        merchant="상점E",
        amount=-120_000,
        payment_method="카드E",
        source_lifecycle_status=TransactionSourceLifecycleStatus.SUPERSEDED.value,
    )
    refund = _transaction(
        tx_date=date(2026, 4, 12),
        tx_time=time(10, 5),
        tx_type="지출",
        category_major="생활",
        category_minor="쇼핑",
        description="이어폰 환불",
        merchant="상점E",
        amount=120_000,
        payment_method="카드E",
    )
    db_session.add_all([stale_purchase, refund])
    await db_session.commit()

    groups = await reconcile_settlement_matches(db_session)
    stored_matches = await _stored_matches(db_session)

    assert groups == []
    assert stored_matches == []


async def test_reconcile_settlement_matches_excludes_non_active_refund_candidates(
    db_session: AsyncSession,
) -> None:
    from app.services.settlement_group_service import reconcile_settlement_matches

    purchase = _transaction(
        tx_date=date(2026, 4, 10),
        tx_time=time(10, 0),
        tx_type="지출",
        category_major="생활",
        category_minor="쇼핑",
        description="키보드 구매",
        merchant="상점F",
        amount=-90_000,
        payment_method="카드F",
    )
    stale_refund = _transaction(
        tx_date=date(2026, 4, 12),
        tx_time=time(10, 5),
        tx_type="지출",
        category_major="생활",
        category_minor="쇼핑",
        description="키보드 환불",
        merchant="상점F",
        amount=90_000,
        payment_method="카드F",
        source_lifecycle_status=TransactionSourceLifecycleStatus.MISSING_FROM_LATEST_EXPORT.value,
    )
    db_session.add_all([purchase, stale_refund])
    await db_session.commit()

    groups = await reconcile_settlement_matches(db_session)
    stored_matches = await _stored_matches(db_session)

    assert groups == []
    assert stored_matches == []


async def test_reconcile_settlement_matches_keeps_malformed_payment_method_review_safe(
    db_session: AsyncSession,
) -> None:
    from app.services.settlement_group_service import reconcile_settlement_matches

    purchase = _transaction(
        tx_date=date(2026, 4, 10),
        tx_time=time(10, 0),
        tx_type="지출",
        category_major="생활",
        category_minor="쇼핑",
        description="마우스 구매",
        merchant="상점G",
        amount=-75_000,
        payment_method="카드G",
    )
    refund = _transaction(
        tx_date=date(2026, 4, 12),
        tx_time=time(10, 5),
        tx_type="지출",
        category_major="생활",
        category_minor="쇼핑",
        description="마우스 환불",
        merchant="상점G",
        amount=75_000,
        payment_method="   ",
    )
    db_session.add_all([purchase, refund])
    await db_session.commit()

    groups = await reconcile_settlement_matches(db_session)
    stored_matches = await _stored_matches(db_session)

    assert groups == []
    assert stored_matches == []


async def test_reconcile_settlement_matches_keeps_blank_currency_review_safe(
    db_session: AsyncSession,
) -> None:
    from app.services.settlement_group_service import reconcile_settlement_matches

    purchase = _transaction(
        tx_date=date(2026, 4, 10),
        tx_time=time(10, 0),
        tx_type="지출",
        category_major="생활",
        category_minor="쇼핑",
        description="책상 구매",
        merchant="상점H",
        amount=-210_000,
        payment_method="카드H",
    )
    refund = _transaction(
        tx_date=date(2026, 4, 12),
        tx_time=time(10, 5),
        tx_type="지출",
        category_major="생활",
        category_minor="쇼핑",
        description="책상 환불",
        merchant="상점H",
        amount=210_000,
        currency=" ",
        payment_method="카드H",
    )
    db_session.add_all([purchase, refund])
    await db_session.commit()

    groups = await reconcile_settlement_matches(db_session)
    stored_matches = await _stored_matches(db_session)

    assert groups == []
    assert stored_matches == []


@pytest.mark.parametrize(
    ("original_overrides", "settlement_overrides"),
    [
        ({"is_deleted": True}, {}),
        ({}, {"is_deleted": True}),
        ({"merged_into_id": 999}, {}),
        ({}, {"merged_into_id": 999}),
    ],
)
async def test_build_confirmed_settlement_analysis_netting_ignores_noncanonical_participants(
    db_session: AsyncSession,
    original_overrides: dict[str, bool | int],
    settlement_overrides: dict[str, bool | int],
) -> None:
    from app.services.settlement_group_service import (
        build_confirmed_refund_netting_map,
        build_confirmed_settlement_analysis_netting,
    )

    purchase = _transaction(
        tx_date=date(2026, 4, 10),
        tx_time=time(10, 0),
        tx_type="지출",
        category_major="생활",
        category_minor="쇼핑",
        description="원결제",
        merchant="상점Z",
        amount=-120_000,
        payment_method="카드Z",
        **original_overrides,
    )
    refund = _transaction(
        tx_date=date(2026, 4, 12),
        tx_time=time(10, 5),
        tx_type="지출",
        category_major="생활",
        category_minor="쇼핑",
        description="환불",
        merchant="상점Z",
        amount=120_000,
        payment_method="카드Z",
        **settlement_overrides,
    )
    db_session.add_all([purchase, refund])
    await db_session.commit()
    db_session.add(
        SettlementMatch(
            original_transaction_id=purchase.id,
            settlement_transaction_id=refund.id,
            status=SettlementMatchStatus.AUTO_CONFIRMED.value,
            matched_amount=120_000,
        )
    )
    await db_session.commit()

    netting = await build_confirmed_settlement_analysis_netting(db_session)

    assert await build_confirmed_refund_netting_map(db_session) == {}
    assert netting.refund_total_by_original_transaction_id == {}
    assert netting.excluded_refund_transaction_ids == frozenset()
