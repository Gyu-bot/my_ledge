from __future__ import annotations

import asyncio
from datetime import date, time
from pathlib import Path

from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.models import Base
from app.models.installment_plan import InstallmentPlan
from app.models.installment_transaction_link import InstallmentTransactionLink
from app.models.loan_account import LoanAccount
from app.models.loan_transaction_link import LoanTransactionLink
from app.models.transaction import Transaction


DB_PATH = Path("/tmp/myledge-audit-api.db")


def expense(
    *,
    transaction_id: int,
    tx_date: date,
    merchant: str,
    amount: int,
    category_major: str = "쇼핑",
    description: str | None = None,
) -> Transaction:
    return Transaction(
        id=transaction_id,
        date=tx_date,
        time=time(9, 0),
        type="지출",
        category_major=category_major,
        category_minor=None,
        category_major_user=None,
        category_minor_user=None,
        description=description or merchant,
        merchant=merchant,
        amount=-abs(amount),
        currency="KRW",
        payment_method="테스트카드",
        cost_kind=None,
        fixed_cost_necessity=None,
        spend_necessity=None,
        cost_classification_source=None,
        recurring_payment_kind=None,
        memo=None,
        is_deleted=False,
        merged_into_id=None,
        source="import",
        source_lifecycle_status="active",
    )


async def main() -> None:
    if DB_PATH.exists():
        DB_PATH.unlink()

    engine = create_async_engine(f"sqlite+aiosqlite:///{DB_PATH}")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)

    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    async with session_factory() as session:
        linked_loan = expense(
            transaction_id=9001,
            tx_date=date(2026, 6, 10),
            merchant="국민은행",
            amount=420000,
            category_major="금융",
            description="국민은행 원리금 상환",
        )
        visible_loan = expense(
            transaction_id=9002,
            tx_date=date(2026, 6, 11),
            merchant="카카오뱅크",
            amount=210000,
            category_major="금융",
            description="카카오뱅크 대출이자",
        )
        account = LoanAccount(
            id=7001,
            lender="국민은행",
            product_name="주택담보대출",
            display_name_user=None,
            loan_kind="mortgage",
            is_hidden=False,
        )
        loan_link = LoanTransactionLink(
            transaction_id=linked_loan.id,
            loan_account_id=account.id,
            repayment_type="principal_interest",
            source="manual",
            memo="seed linked loan",
        )

        plan_a = InstallmentPlan(
            id=7101,
            display_name="애플 스토어",
            merchant="애플 스토어",
            total_installments=3,
            monthly_amount=300000,
            first_payment_date=date(2026, 6, 15),
            status="active",
            memo=None,
        )
        plan_b = InstallmentPlan(
            id=7102,
            display_name="애플 교육",
            merchant="애플 스토어",
            total_installments=3,
            monthly_amount=300000,
            first_payment_date=date(2026, 7, 15),
            status="active",
            memo=None,
        )
        duplicate_suggestion = expense(
            transaction_id=9101,
            tx_date=date(2026, 7, 15),
            merchant="애플 스토어",
            amount=300000,
            description="애플 스토어 할부",
        )
        occupied = expense(
            transaction_id=9102,
            tx_date=date(2026, 6, 15),
            merchant="애플 스토어",
            amount=300000,
            description="애플 스토어 할부 기존 연결",
        )
        occupied_link = InstallmentTransactionLink(
            transaction_id=occupied.id,
            installment_plan_id=plan_a.id,
            installment_number=1,
            source="manual",
            memo="seed occupied installment",
        )

        spending_previous = expense(
            transaction_id=9201,
            tx_date=date(2026, 5, 5),
            merchant="푸드코트",
            amount=410000,
            category_major="식비",
        )
        spending_current = expense(
            transaction_id=9202,
            tx_date=date(2026, 6, 5),
            merchant="푸드코트",
            amount=740000,
            category_major="식비",
        )

        session.add_all(
            [
                linked_loan,
                visible_loan,
                account,
                loan_link,
                plan_a,
                plan_b,
                duplicate_suggestion,
                occupied,
                occupied_link,
                spending_previous,
                spending_current,
            ]
        )
        await session.commit()

    await engine.dispose()
    print(f"seeded {DB_PATH}")


if __name__ == "__main__":
    asyncio.run(main())
