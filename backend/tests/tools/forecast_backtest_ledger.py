"""Synthetic ledger for the forecast backtest tests. No real values or names.

Every month repeats the same pattern, so the live forecast should reproduce
each closed month exactly at every as-of day. Distinctive amounts make it easy
to prove that the default report never prints a won amount.
"""

from datetime import date, time
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    InstallmentPlan,
    InstallmentTransactionLink,
    Loan,
    LoanAccount,
    LoanTransactionLink,
    Transaction,
    UploadLog,
)
from app.services.nature_axes_service import write_through_legacy_classification

SALARY = 123_457
SUBSCRIPTION = 4_321
LOAN_PAYMENT = 7_013
INSTALLMENT = 2_017
GROCERY = 97
GROCERY_DAYS = (2, 5, 9, 13, 17, 21, 25, 28)
MONTHS = tuple(range(1, 11))  # 2031-01 .. 2031-10 closed; 2031-11 partial
PAYER = "Synthetic Payer"
SUBSCRIPTION_MERCHANT = "Synthetic Subscription"
GROCER = "Synthetic Grocer"
LENDER = "Synthetic Bank"
DEVICE = "Synthetic Device"
PRIVATE_STRINGS = (
    str(SALARY),
    str(SUBSCRIPTION),
    str(LOAN_PAYMENT),
    str(INSTALLMENT),
    PAYER,
    SUBSCRIPTION_MERCHANT,
    GROCER,
    LENDER,
    DEVICE,
)


def _tx(on: date, amount: int, merchant: str, category: str, **values) -> Transaction:
    return Transaction(
        date=on,
        time=time(12),
        type=values.pop("type", "수입" if amount > 0 else "지출"),
        merchant=merchant,
        description=merchant,
        category_major=category,
        amount=amount,
        **values,
    )


async def build_backtest_ledger(
    session: AsyncSession, *, link_loans: bool = True
) -> None:
    account = LoanAccount(lender=LENDER, product_name="Synthetic Loan")
    session.add(account)
    session.add(
        Loan(
            snapshot_date=date(2030, 12, 31),
            lender=LENDER,
            product_name="Synthetic Loan",
            balance=Decimal(1_000_000),
            monthly_payment=Decimal(LOAN_PAYMENT),
            monthly_payment_source="manual",
        )
    )
    plan = InstallmentPlan(
        display_name="Synthetic Plan",
        merchant=DEVICE,
        monthly_amount=INSTALLMENT,
        first_payment_date=date(2031, 3, 20),
        total_installments=6,
        status="active",
    )
    session.add(plan)
    await session.flush()
    for month in MONTHS:
        for day in GROCERY_DAYS:
            session.add(
                _tx(
                    date(2031, month, day),
                    -GROCERY,
                    GROCER,
                    "식비",
                    cost_kind="variable",
                )
            )
        session.add(_tx(date(2031, month, 27), SALARY, PAYER, "급여"))
        session.add(
            _tx(
                date(2031, month, 12),
                -SUBSCRIPTION,
                SUBSCRIPTION_MERCHANT,
                "생활",
                cost_kind="fixed",
                recurring_payment_kind="monthly_recurring",
            )
        )
        repayment = _tx(date(2031, month, 15), -LOAN_PAYMENT, LENDER, "대출")
        session.add(repayment)
        installment = None
        if 3 <= month <= 8:
            installment = _tx(date(2031, month, 20), -INSTALLMENT, DEVICE, "쇼핑")
            session.add(installment)
        await session.flush()
        if link_loans:
            session.add(
                LoanTransactionLink(
                    transaction_id=repayment.id, loan_account_id=account.id
                )
            )
        if installment is not None:
            session.add(
                InstallmentTransactionLink(
                    transaction_id=installment.id,
                    installment_plan_id=plan.id,
                    installment_number=month - 2,
                )
            )
    # Data reaches into November, so October is a closed month.
    session.add(_tx(date(2031, 11, 2), -GROCERY, GROCER, "식비", cost_kind="variable"))
    session.add(
        UploadLog(snapshot_date=date(2031, 11, 2), status="success", filename="x.xlsx")
    )
    await session.flush()
    # T056: legacy classification reaches the metric views through the two-axis tables.
    transaction_ids = list(
        (await session.execute(select(Transaction.id))).scalars().all()
    )
    await write_through_legacy_classification(session, transaction_ids)
    await session.commit()
