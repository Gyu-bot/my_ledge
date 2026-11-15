"""Synthetic snapshot pairs and ledger for the T061 reconciliation (no real data).

Asset (net worth) snapshots at D0 < D1 < D2 (month ends), loans and
investments snapshots on the same dates, and a ledger from 2026-01-01 to D2.
Every name is synthetic.

Interval (D0, D1] is constructed so every item is known by hand:

- income 3,000,000; spend 600,000 (loan-linked 원리금) + 400,000 (protected)
  + 100,000 (undecided adjustability) + 20,000 on D1 itself = 1,120,000;
  a 50,000 spend dated D0 belongs to the previous interval.
  residual = 1,880,000.
- loans balance 10,000,000 -> 9,500,000: decrease 500,000.
- investment transfer −1,000,000 (rule on merchant ``broker-x``); market value
  2,000,000 -> 3,150,000: valuation 150,000.
- savings transfer −300,000 (transaction-level); internal move −700,000 /
  +700,000 (both legs, category rule).
- the D1 cash balance is 30,000 lower than the ledger explains:
  unexplained −30,000.

Interval (D1, D2]: an unmarked transfer −200,000 (undecided), income
3,000,000, loan-linked −600,000, protected spend −1,000,000; loans
9,500,000 -> 9,000,000; investments 3,150,000 -> 3,000,000.
"""

from dataclasses import dataclass, field
from datetime import date, time
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.asset_snapshot import AssetSnapshot
from app.models.investment import Investment
from app.models.loan import Loan
from app.models.loan_account import LoanAccount
from app.models.loan_transaction_link import LoanTransactionLink
from app.models.nature_axes import CategoryAdjustabilityDefault
from app.models.transaction import Transaction
from app.models.transfer_purpose import TransferPurposeOverride, TransferPurposeRule

D0 = date(2026, 1, 31)
D1 = date(2026, 2, 28)
D2 = date(2026, 3, 31)


def tx(
    day: date,
    amount: int,
    *,
    tx_type: str = "지출",
    merchant: str = "shop-a",
    category: str = "cat-spend",
    currency: str = "KRW",
) -> Transaction:
    return Transaction(
        date=day,
        time=time(12, 0),
        type=tx_type,
        category_major=category,
        category_minor=None,
        description=merchant,
        merchant=merchant,
        amount=amount,
        currency=currency,
        payment_method="account-a",
    )


def asset_rows(
    day: date,
    *,
    cash: int,
    savings: int,
    investments: int,
    loan: int,
    name_rule_cash: int = 0,
) -> list[AssetSnapshot]:
    rows = [
        AssetSnapshot(
            snapshot_date=day,
            side="asset",
            category="asset-cash",
            product_name="account-a",
            amount=Decimal(cash),
            is_cash_equivalent=True,
        ),
        AssetSnapshot(
            snapshot_date=day,
            side="asset",
            category="asset-savings",
            product_name="deposit-a",
            amount=Decimal(savings),
            is_cash_equivalent=False,
        ),
        AssetSnapshot(
            snapshot_date=day,
            side="asset",
            category="asset-invest",
            product_name="broker-a",
            amount=Decimal(investments),
            liquidity_tier="near_liquid",
        ),
        AssetSnapshot(
            snapshot_date=day,
            side="liability",
            category="liability-loan",
            product_name="loan-a",
            amount=Decimal(loan),
        ),
        # Negative asset rows are excluded from net worth (existing rule).
        AssetSnapshot(
            snapshot_date=day,
            side="asset",
            category="asset-other",
            product_name="negative-a",
            amount=Decimal(-5_000),
        ),
    ]
    if name_rule_cash:
        # No human liquidity metadata: judged by the existing name rule.
        rows.append(
            AssetSnapshot(
                snapshot_date=day,
                side="asset",
                category="예금-synthetic",
                product_name="deposit-b",
                amount=Decimal(name_rule_cash),
            )
        )
    return rows


def loan_row(day: date, balance: int | None) -> Loan:
    return Loan(
        snapshot_date=day,
        lender="lender-a",
        product_name="loan-a",
        balance=None if balance is None else Decimal(balance),
    )


def investment_row(day: date, value: int | None, name: str = "fund-a") -> Investment:
    return Investment(
        snapshot_date=day,
        broker="broker-a",
        product_name=name,
        market_value=None if value is None else Decimal(value),
    )


@dataclass
class Scenario:
    ids: dict[str, int] = field(default_factory=dict)
    loan_account_id: int | None = None


async def build_net_worth_scenario(db_session: AsyncSession) -> Scenario:
    scenario = Scenario()
    # Snapshots. NW = cash + savings + investments − loan (negative row excluded).
    db_session.add_all(
        [
            *asset_rows(
                D0,
                cash=5_000_000,
                savings=1_000_000,
                investments=2_000_000,
                loan=10_000_000,
            ),
            *asset_rows(
                D1,
                cash=5_550_000,
                savings=1_300_000,
                investments=3_150_000,
                loan=9_500_000,
            ),
            *asset_rows(
                D2,
                cash=6_580_000,
                savings=1_300_000,
                investments=3_000_000,
                loan=9_000_000,
                name_rule_cash=400_000,
            ),
            loan_row(D0, 10_000_000),
            loan_row(D1, 9_500_000),
            loan_row(D2, 9_000_000),
            investment_row(D0, 2_000_000),
            investment_row(D1, 3_150_000),
            investment_row(D2, 3_000_000),
        ]
    )
    rows = {
        # January (before D0 / on D0): only coverage and the boundary.
        "jan_income": tx(date(2026, 1, 1), 3_000_000, tx_type="수입", merchant="payer"),
        "jan_spend": tx(date(2026, 1, 10), -900_000, category="cat-protected"),
        "on_d0": tx(D0, -50_000, category="cat-protected"),
        # (D0, D1]
        "feb_income": tx(
            date(2026, 2, 25), 3_000_000, tx_type="수입", merchant="payer"
        ),
        "feb_loan": tx(date(2026, 2, 10), -600_000, merchant="lender-a"),
        "feb_protected": tx(date(2026, 2, 12), -400_000, category="cat-protected"),
        "feb_undecided": tx(date(2026, 2, 14), -100_000, category="cat-open"),
        "on_d1": tx(D1, -20_000, category="cat-protected"),
        "feb_invest": tx(
            date(2026, 2, 5),
            -1_000_000,
            tx_type="이체",
            merchant="broker-x",
            category="cat-transfer",
        ),
        "feb_savings": tx(
            date(2026, 2, 6),
            -300_000,
            tx_type="이체",
            merchant="deposit-x",
            category="cat-transfer",
        ),
        "feb_move_out": tx(
            date(2026, 2, 7),
            -700_000,
            tx_type="이체",
            merchant="own-b",
            category="cat-internal",
        ),
        "feb_move_in": tx(
            date(2026, 2, 7),
            700_000,
            tx_type="이체",
            merchant="own-a",
            category="cat-internal",
        ),
        # (D1, D2]
        "mar_income": tx(
            date(2026, 3, 25), 3_000_000, tx_type="수입", merchant="payer"
        ),
        "mar_loan": tx(date(2026, 3, 10), -600_000, merchant="lender-a"),
        "mar_protected": tx(date(2026, 3, 12), -1_000_000, category="cat-protected"),
        "mar_unmarked": tx(
            date(2026, 3, 20),
            -200_000,
            tx_type="이체",
            merchant="unknown-x",
            category="cat-transfer",
        ),
        "mar_end": tx(D2, -1, category="cat-protected"),
    }
    db_session.add_all(rows.values())
    loan_account = LoanAccount(lender="lender-a", product_name="loan-a")
    db_session.add(loan_account)
    await db_session.flush()
    scenario.ids = {key: row.id for key, row in rows.items()}
    scenario.loan_account_id = loan_account.id
    ids = scenario.ids
    db_session.add_all(
        [
            LoanTransactionLink(
                transaction_id=ids["feb_loan"], loan_account_id=loan_account.id
            ),
            LoanTransactionLink(
                transaction_id=ids["mar_loan"], loan_account_id=loan_account.id
            ),
            CategoryAdjustabilityDefault(
                category_major="cat-protected", adjustability="protected"
            ),
            # Human marks: a counterparty rule, a category rule, one transaction.
            TransferPurposeRule(
                match_scope="merchant", merchant="broker-x", purpose="investment"
            ),
            TransferPurposeRule(
                match_scope="category",
                category_major="cat-internal",
                purpose="internal_move",
            ),
            TransferPurposeOverride(
                transaction_id=ids["feb_savings"], purpose="savings"
            ),
        ]
    )
    await db_session.commit()
    return scenario
