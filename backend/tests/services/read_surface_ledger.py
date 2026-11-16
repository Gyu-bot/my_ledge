"""Synthetic ledger for the agent read surface (T060). No real financial data.

Twenty months of activity (``FIRST_PERIOD`` .. ``IN_PROGRESS_PERIOD``) with a
configurable number of ordinary purchases per month, plus:

- monthly income, a monthly transfer to savings, refunds, deleted rows, and a
  non-KRW row (excluded from metrics);
- a loan with a recorded monthly payment and linked repayments, except one
  closed month whose repayment is not linked (``LOAN_GAP_PERIOD``);
- a six-payment installment plan: three linked occurrences, one month with a
  transaction a person marked as installment but did not link
  (``INSTALLMENT_FLAGGED_PERIOD``), one closed month with nothing
  (``INSTALLMENT_MISSING_PERIOD``), and the rest after the as-of date;
- recurring bundles: monthly (adjustable), yearly (anchor month March), and
  one with no recorded cycle;
- category adjustability defaults for some categories only (the rest stay
  undecided);
- a month with no transactions inside the imported range (``GAP_PERIOD``);
- large one-off discretionary purchases and a category spike in
  ``SPIKE_PERIOD`` for the post-hoc review list;
- snapshots of every kind on different dates.
"""

import random
from dataclasses import dataclass, field
from datetime import date, time
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.asset_snapshot import AssetSnapshot
from app.models.installment_plan import InstallmentPlan
from app.models.installment_transaction_link import InstallmentTransactionLink
from app.models.insurance_contract import InsuranceContract
from app.models.investment import Investment
from app.models.loan import Loan
from app.models.loan_account import LoanAccount
from app.models.loan_transaction_link import LoanTransactionLink
from app.models.nature_axes import (
    CategoryAdjustabilityDefault,
    RecurringCommitment,
    TransactionNatureOverride,
)
from app.models.transaction import Transaction
from app.models.user_profile_snapshot import UserProfileSnapshot
from legacy_nature_seed import write_through_legacy_classification

FIRST_PERIOD = "2025-01"
LAST_CLOSED_PERIOD = "2026-07"
IN_PROGRESS_PERIOD = "2026-08"
AS_OF = date(2026, 8, 14)
GAP_PERIOD = "2025-09"
LOAN_GAP_PERIOD = "2025-06"
SPIKE_PERIOD = "2026-07"
INSTALLMENT_FIRST = date(2026, 3, 15)
INSTALLMENT_FLAGGED_PERIOD = "2026-06"
INSTALLMENT_MISSING_PERIOD = "2026-07"
LOAN_MONTHLY_PAYMENT = 450_000
INSTALLMENT_MONTHLY = 120_000
SNAPSHOT_DATES = {
    "assets": date(2026, 7, 31),
    "loans": date(2026, 6, 30),
    "investments": date(2026, 5, 31),
    "insurance": date(2026, 4, 30),
    "profile": date(2026, 3, 31),
}
CATEGORIES = [f"category-{index:02d}" for index in range(1, 13)]
PROTECTED_CATEGORY = "category-01"
ADJUSTABLE_CATEGORY = "category-05"


@dataclass
class ReadLedger:
    loan_account_id: int = 0
    installment_plan_id: int = 0
    monthly_commitment_id: int = 0
    yearly_commitment_id: int = 0
    uncycled_commitment_id: int = 0
    flagged_installment_tx_id: int = 0
    transaction_count: int = 0
    ids: dict[str, int] = field(default_factory=dict)


def periods() -> list[str]:
    result = []
    year, month = 2025, 1
    while True:
        period = f"{year:04d}-{month:02d}"
        result.append(period)
        if period == IN_PROGRESS_PERIOD:
            return result
        month += 1
        if month == 13:
            year, month = year + 1, 1


def _tx(
    on: date,
    amount: int,
    *,
    merchant: str,
    category: str,
    tx_type: str = "지출",
    currency: str = "KRW",
    spend_necessity: str | None = None,
    is_deleted: bool = False,
) -> Transaction:
    return Transaction(
        date=on,
        time=time(12, 0),
        type=tx_type,
        category_major=category,
        category_minor=None,
        description=merchant,
        merchant=merchant,
        amount=amount,
        currency=currency,
        payment_method="card-a",
        spend_necessity=spend_necessity,
        is_deleted=is_deleted,
    )


def _day(period: str, day: int) -> date:
    year, month = (int(part) for part in period.split("-"))
    return date(year, month, day)


async def build_read_surface_ledger(
    session: AsyncSession, *, purchases_per_month: int = 12, seed: int = 60
) -> ReadLedger:
    rng = random.Random(seed)
    ledger = ReadLedger()

    loan_account = LoanAccount(lender="lender-a", product_name="loan-product-a")
    plan = InstallmentPlan(
        display_name="installment-a",
        merchant="shop-installment",
        payment_method="card-a",
        total_installments=6,
        monthly_amount=INSTALLMENT_MONTHLY,
        first_payment_date=INSTALLMENT_FIRST,
        status="active",
    )
    monthly = RecurringCommitment(
        label="subscription-a",
        match_scope="merchant",
        merchant="service-sub",
        category_major="category-02",
        cycle="monthly",
        amount_kind="fixed",
        adjustability="adjustable",
        origin="user",
    )
    yearly = RecurringCommitment(
        label="annual-fee-a",
        match_scope="merchant",
        merchant="annual-fee",
        category_major="category-03",
        cycle="yearly",
        amount_kind="fixed",
        start_date=date(2025, 3, 1),
        origin="user",
    )
    uncycled = RecurringCommitment(
        label="bundle-without-cycle",
        match_scope="merchant",
        merchant="service-uncycled",
        category_major="category-04",
        origin="user",
    )
    session.add_all(
        [
            loan_account,
            plan,
            monthly,
            yearly,
            uncycled,
            CategoryAdjustabilityDefault(
                category_major=PROTECTED_CATEGORY, adjustability="protected"
            ),
            CategoryAdjustabilityDefault(
                category_major=ADJUSTABLE_CATEGORY, adjustability="adjustable"
            ),
        ]
    )
    await session.flush()
    ledger.loan_account_id = loan_account.id
    ledger.installment_plan_id = plan.id
    ledger.monthly_commitment_id = monthly.id
    ledger.yearly_commitment_id = yearly.id
    ledger.uncycled_commitment_id = uncycled.id

    rows: list[Transaction] = []
    loan_rows: list[tuple[str, Transaction]] = []
    installment_rows: list[tuple[int, Transaction]] = []
    flagged: Transaction | None = None
    for period in periods():
        if period == GAP_PERIOD:
            continue
        last_day = 14 if period == IN_PROGRESS_PERIOD else 28
        if period != IN_PROGRESS_PERIOD:
            rows.append(
                _tx(
                    _day(period, 25),
                    3_200_000,
                    merchant="payer-a",
                    category="income-a",
                    tx_type="수입",
                )
            )
            rows.append(
                _tx(
                    _day(period, 26),
                    -500_000,
                    merchant="savings-a",
                    category="transfer-a",
                    tx_type="이체",
                )
            )
        repayment = _tx(
            _day(period, 10),
            -LOAN_MONTHLY_PAYMENT,
            merchant="lender-a",
            category="category-06",
        )
        rows.append(repayment)
        if period != LOAN_GAP_PERIOD:
            loan_rows.append((period, repayment))
        rows.append(
            _tx(
                _day(period, 5),
                -15_000,
                merchant="service-sub",
                category="category-02",
            )
        )
        if period.endswith("-03"):
            rows.append(
                _tx(
                    _day(period, 3),
                    -99_000,
                    merchant="annual-fee",
                    category="category-03",
                )
            )
        for index in range(purchases_per_month):
            category = CATEGORIES[index % len(CATEGORIES)]
            if category in ("category-02", "category-03", "category-06"):
                category = "category-07"
            amount = -rng.randint(3, 60) * 1_000
            rows.append(
                _tx(
                    _day(period, 1 + index % last_day),
                    amount,
                    merchant=f"merchant-{rng.randint(1, 40):03d}",
                    category=category,
                    spend_necessity="discretionary" if index % 3 == 0 else None,
                )
            )
        if period == SPIKE_PERIOD:
            rows.append(
                _tx(
                    _day(period, 20),
                    -900_000,
                    merchant="merchant-big",
                    category="category-08",
                    spend_necessity="discretionary",
                )
            )
        # Installment occurrences.
        number = _installment_number(period)
        if number is not None and period <= LAST_CLOSED_PERIOD:
            if period == INSTALLMENT_FLAGGED_PERIOD:
                flagged = _tx(
                    _day(period, 15),
                    -INSTALLMENT_MONTHLY,
                    merchant="shop-installment",
                    category="category-09",
                )
                rows.append(flagged)
            elif period != INSTALLMENT_MISSING_PERIOD:
                occurrence = _tx(
                    _day(period, 15),
                    -INSTALLMENT_MONTHLY,
                    merchant="shop-installment",
                    category="category-09",
                )
                rows.append(occurrence)
                installment_rows.append((number, occurrence))
        # A refund and an excluded (deleted) row every month.
        rows.append(
            _tx(
                _day(period, 12), 4_000, merchant="merchant-001", category="category-07"
            )
        )
        rows.append(
            _tx(
                _day(period, 13),
                -70_000,
                merchant="merchant-002",
                category="category-07",
                is_deleted=True,
            )
        )
    rows.append(_tx(AS_OF, -8_000, merchant="merchant-003", category="category-07"))
    rows.append(
        _tx(
            date(2026, 2, 2),
            -30,
            merchant="merchant-abroad",
            category="category-07",
            currency="USD",
        )
    )
    session.add_all(rows)
    await session.flush()
    session.add_all(
        [
            LoanTransactionLink(transaction_id=row.id, loan_account_id=loan_account.id)
            for _, row in loan_rows
        ]
    )
    session.add_all(
        [
            InstallmentTransactionLink(
                transaction_id=row.id,
                installment_plan_id=plan.id,
                installment_number=number,
            )
            for number, row in installment_rows
        ]
    )
    if flagged is not None:
        session.add(
            TransactionNatureOverride(
                transaction_id=flagged.id,
                installment_link_unconfirmed=True,
                source="user",
            )
        )
        ledger.flagged_installment_tx_id = flagged.id
    for kind, snapshot_date in SNAPSHOT_DATES.items():
        if kind == "assets":
            session.add(
                AssetSnapshot(
                    snapshot_date=snapshot_date,
                    side="asset",
                    category="cash-a",
                    product_name="account-a",
                    amount=Decimal("1000000"),
                )
            )
        elif kind == "loans":
            session.add(
                Loan(
                    snapshot_date=snapshot_date,
                    lender="lender-a",
                    product_name="loan-product-a",
                    principal=Decimal("30000000"),
                    balance=Decimal("20000000"),
                    monthly_payment=Decimal(LOAN_MONTHLY_PAYMENT),
                    monthly_payment_source="manual",
                    start_date=date(2023, 1, 1),
                    maturity_date=date(2030, 1, 1),
                )
            )
        elif kind == "investments":
            session.add(
                Investment(
                    snapshot_date=snapshot_date,
                    broker="broker-a",
                    product_name="fund-a",
                    market_value=Decimal("500000"),
                )
            )
        elif kind == "insurance":
            session.add(
                InsuranceContract(
                    snapshot_date=snapshot_date,
                    insurer="insurer-a",
                    product_name="policy-a",
                )
            )
        else:
            session.add(UserProfileSnapshot(snapshot_date=snapshot_date))
    await session.commit()
    # Rows a person marked with the old necessity column reach the T056 axes
    # through the same write-through a human edit runs (readers decide from
    # vw_transaction_nature, not from the old column).
    await write_through_legacy_classification(
        session, [row.id for row in rows if row.spend_necessity is not None]
    )
    await session.commit()
    ledger.transaction_count = len(rows)
    return ledger


def _installment_number(period: str) -> int | None:
    year, month = (int(part) for part in period.split("-"))
    offset = (year - INSTALLMENT_FIRST.year) * 12 + month - INSTALLMENT_FIRST.month
    if 0 <= offset < 6:
        return offset + 1
    return None
