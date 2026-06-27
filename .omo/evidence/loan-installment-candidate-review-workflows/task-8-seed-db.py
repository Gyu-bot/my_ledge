from __future__ import annotations

import asyncio
from datetime import date, datetime, time
import os
from pathlib import Path
import sys

from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "backend"))

from app.models import Base
from app.models.installment_plan import InstallmentPlan
from app.models.loan_account import LoanAccount
from app.models.transaction import Transaction


DB_URL = os.environ["DATABASE_URL"]


def tx(
    *,
    tx_date: date,
    description: str,
    merchant: str,
    amount: int,
    category_major: str,
    category_minor: str | None = None,
    payment_method: str | None = None,
    recurring_payment_kind: str | None = None,
) -> Transaction:
    now = datetime(2026, 6, 27, 0, 0, 0)
    return Transaction(
        date=tx_date,
        time=time(9, 0),
        type="지출",
        category_major=category_major,
        category_minor=category_minor,
        description=description,
        merchant=merchant,
        amount=amount,
        currency="KRW",
        payment_method=payment_method,
        recurring_payment_kind=recurring_payment_kind,
        source="import",
        created_at=now,
        updated_at=now,
    )


async def seed(session: AsyncSession) -> None:
    session.add(
        LoanAccount(
            lender="국민은행",
            product_name="QA 주택담보대출",
            display_name_user="QA 주담대",
            loan_kind="equal_principal_interest",
        )
    )
    session.add(
        InstallmentPlan(
            display_name="QA 맥북 3개월 할부",
            merchant="애플",
            payment_method="QA 카드",
            total_installments=3,
            monthly_amount=100000,
            first_payment_date=date(2026, 5, 10),
            status="active",
        )
    )
    session.add_all(
        [
            tx(
                tx_date=date(2026, 6, 20),
                description="국민은행 대출이자 QA",
                merchant="국민은행 대출이자 QA",
                amount=-350000,
                category_major="금융",
                category_minor="대출상환",
                payment_method="국민은행 계좌",
            ),
            tx(
                tx_date=date(2026, 5, 10),
                description="애플 결제 1 QA",
                merchant="애플",
                amount=-99500,
                category_major="쇼핑",
                category_minor="전자제품",
                payment_method="QA 카드",
                recurring_payment_kind="installment",
            ),
            tx(
                tx_date=date(2026, 6, 10),
                description="애플 결제 2 QA",
                merchant="애플",
                amount=-100200,
                category_major="쇼핑",
                category_minor="전자제품",
                payment_method="QA 카드",
                recurring_payment_kind="installment",
            ),
            tx(
                tx_date=date(2026, 7, 12),
                description="애플 결제 3 QA",
                merchant="애플",
                amount=-100000,
                category_major="쇼핑",
                category_minor="전자제품",
                payment_method="QA 카드",
                recurring_payment_kind="installment",
            ),
            tx(
                tx_date=date(2026, 5, 12),
                description="전월 식비 QA",
                merchant="QA 식당",
                amount=-100000,
                category_major="식비",
                category_minor="외식",
                payment_method="QA 카드",
            ),
            tx(
                tx_date=date(2026, 6, 12),
                description="이번달 식비 QA",
                merchant="QA 식당",
                amount=-150000,
                category_major="식비",
                category_minor="외식",
                payment_method="QA 카드",
            ),
        ]
    )
    await session.commit()


async def main() -> None:
    engine = create_async_engine(DB_URL)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.drop_all)
        await connection.run_sync(Base.metadata.create_all)
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with session_factory() as session:
        await seed(session)
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
