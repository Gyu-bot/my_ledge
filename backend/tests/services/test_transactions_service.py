from datetime import date, datetime, time

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.transaction import Transaction
from app.services.transactions_service import build_transactions_effective_select


def _transaction(
    *,
    tx_date: date,
    tx_time: time,
    tx_type: str,
    category_major: str,
    category_minor: str | None,
    description: str,
    amount: int,
    payment_method: str | None,
    memo: str | None = None,
    category_major_user: str | None = None,
    category_minor_user: str | None = None,
    is_deleted: bool = False,
    merged_into_id: int | None = None,
) -> Transaction:
    now = datetime(2026, 3, 26, 0, 0, 0)
    return Transaction(
        date=tx_date,
        time=tx_time,
        type=tx_type,
        category_major=category_major,
        category_minor=category_minor,
        category_major_user=category_major_user,
        category_minor_user=category_minor_user,
        description=description,
        amount=amount,
        currency="KRW",
        payment_method=payment_method,
        memo=memo,
        is_deleted=is_deleted,
        merged_into_id=merged_into_id,
        source="import",
        created_at=now,
        updated_at=now,
    )


async def test_build_transactions_effective_select_returns_raw_and_effective_columns(
    db_session: AsyncSession,
) -> None:
    db_session.add_all(
        [
            _transaction(
                tx_date=date(2026, 3, 10),
                tx_time=time(12, 0),
                tx_type="지출",
                category_major="미분류",
                category_minor="미분류",
                category_major_user="식비",
                category_minor_user="배달",
                description="쿠팡이츠",
                amount=-23000,
                payment_method="카드 A",
                memo="저녁",
            ),
            _transaction(
                tx_date=date(2026, 3, 9),
                tx_time=time(9, 0),
                tx_type="지출",
                category_major="교통",
                category_minor="택시",
                description="병합 후보",
                amount=-12000,
                payment_method="카드 B",
                is_deleted=True,
                merged_into_id=99,
            ),
        ]
    )
    await db_session.commit()

    canonical = build_transactions_effective_select().subquery()
    rows = (
        await db_session.execute(select(canonical).order_by(canonical.c.date.desc(), canonical.c.time.desc()))
    ).mappings().all()

    assert len(rows) == 2
    assert rows[0]["effective_category_major"] == "식비"
    assert rows[0]["effective_category_minor"] == "배달"
    assert rows[0]["is_edited"] is True
    assert rows[1]["is_deleted"] is True
    assert rows[1]["merged_into_id"] == 99
