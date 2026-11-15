"""Synthetic ledger for metric-view invariants (no real financial data).

Mixes income, transfers, loan- and installment-linked payments, every
classification combination the flow mapping reads, refunds (unallocated, fully
allocated across a month boundary, partially allocated, allocated to several
purchases), zero-amount rows, and rows the metric basis must exclude (deleted,
merged, superseded, non-KRW).
"""

from collections import defaultdict
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, time

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.installment_plan import InstallmentPlan
from app.models.installment_transaction_link import InstallmentTransactionLink
from app.models.loan_account import LoanAccount
from app.models.loan_transaction_link import LoanTransactionLink
from app.models.settlement_group import SettlementMatch
from app.models.transaction import Transaction, TransactionSourceLifecycleStatus
from app.services.metric_views import (
    FLOW_LINES_VIEW,
    MONTHLY_FLOW_SUMMARY_VIEW,
    MONTHLY_FLOW_VIEW,
)

AS_OF = date(2026, 3, 15)


@dataclass
class SyntheticLedger:
    ids: dict[str, int] = field(default_factory=dict)
    # Independent expectation: signed KRW amount per month of rows that the
    # metric basis must include.
    included_signed_by_period: dict[str, int] = field(default_factory=dict)
    included_ids: set[int] = field(default_factory=set)
    excluded_ids: set[int] = field(default_factory=set)
    expected_row_by_key: dict[str, str] = field(default_factory=dict)


def _tx(
    tx_date: date,
    amount: int,
    *,
    tx_type: str = "지출",
    name: str = "synthetic",
    category: str = "category-a",
    cost_kind: str | None = None,
    fixed_cost_necessity: str | None = None,
    spend_necessity: str | None = None,
    recurring_payment_kind: str | None = None,
    currency: str = "KRW",
) -> Transaction:
    return Transaction(
        date=tx_date,
        time=time(12, 0),
        type=tx_type,
        category_major=category,
        category_minor=None,
        description=name,
        merchant=name,
        amount=amount,
        currency=currency,
        payment_method="card-a",
        cost_kind=cost_kind,
        fixed_cost_necessity=fixed_cost_necessity,
        spend_necessity=spend_necessity,
        recurring_payment_kind=recurring_payment_kind,
    )


async def build_synthetic_ledger(db_session: AsyncSession) -> SyntheticLedger:
    ledger = SyntheticLedger()
    rows: dict[str, tuple[Transaction, str | None]] = {
        # key: (transaction, expected flow_row or None when excluded)
        "salary_jan": (
            _tx(date(2026, 1, 25), 3_000_000, tx_type="수입", name="payer"),
            "income_undetermined",
        ),
        "salary_feb": (
            _tx(date(2026, 2, 25), 3_000_000, tx_type="수입", name="payer"),
            "income_undetermined",
        ),
        "loan_payment": (
            _tx(date(2026, 1, 10), -500_000, name="lender"),
            "committed_loan",
        ),
        "installment_payment": (
            _tx(
                date(2026, 1, 15),
                -100_000,
                name="shop-i",
                spend_necessity="discretionary",
            ),
            "committed_installment",
        ),
        "subscription": (
            _tx(
                date(2026, 1, 5),
                -15_000,
                name="subscription",
                cost_kind="fixed",
                fixed_cost_necessity="discretionary",
            ),
            "committed_recurring",
        ),
        "registered_recurring": (
            _tx(
                date(2026, 1, 6),
                -11_000,
                name="registered",
                recurring_payment_kind="monthly_recurring",
            ),
            "committed_recurring",
        ),
        "groceries": (
            _tx(
                date(2026, 1, 7),
                -200_000,
                name="grocer",
                cost_kind="variable",
                spend_necessity="essential",
            ),
            "ad_hoc_protected",
        ),
        "dining": (
            _tx(
                date(2026, 1, 8),
                -80_000,
                name="diner",
                cost_kind="variable",
                spend_necessity="discretionary",
            ),
            "ad_hoc_adjustable",
        ),
        "unclassified": (_tx(date(2026, 1, 9), -30_000, name="misc"), "undecided"),
        "boundary_purchase": (
            _tx(
                date(2026, 1, 31),
                -120_000,
                name="shop-b",
                category="category-b",
                cost_kind="variable",
                spend_necessity="discretionary",
            ),
            "ad_hoc_adjustable",
        ),
        "boundary_refund": (
            _tx(date(2026, 2, 2), 50_000, name="shop-b", category="category-c"),
            "ad_hoc_adjustable",
        ),
        "partial_purchase": (
            _tx(
                date(2026, 2, 10),
                -100_000,
                name="shop-p",
                cost_kind="variable",
                spend_necessity="discretionary",
            ),
            "ad_hoc_adjustable",
        ),
        # 40,000 allocated (adjustable); 40,000 remainder keeps own (undecided).
        "partial_refund": (_tx(date(2026, 2, 12), 80_000, name="shop-p"), None),
        "multi_purchase_a": (
            _tx(
                date(2026, 2, 3),
                -60_000,
                name="shop-m",
                cost_kind="variable",
                spend_necessity="essential",
            ),
            "ad_hoc_protected",
        ),
        "multi_purchase_b": (
            _tx(
                date(2026, 2, 4),
                -40_000,
                name="shop-m",
                cost_kind="variable",
                spend_necessity="discretionary",
            ),
            "ad_hoc_adjustable",
        ),
        "multi_refund": (_tx(date(2026, 2, 20), 70_000, name="shop-m"), None),
        "unallocated_refund": (
            _tx(
                date(2026, 2, 6),
                5_000,
                name="diner",
                cost_kind="variable",
                spend_necessity="discretionary",
            ),
            "ad_hoc_adjustable",
        ),
        "transfer_out": (
            _tx(date(2026, 1, 20), -1_000_000, tx_type="이체", name="own-account"),
            "transfer_undetermined",
        ),
        "transfer_in": (
            _tx(date(2026, 2, 20), 200_000, tx_type="이체", name="own-account"),
            "transfer_undetermined",
        ),
        "fixed_not_recurring": (
            _tx(
                date(2026, 2, 18),
                -12_000,
                name="conflict-1",
                cost_kind="fixed",
                fixed_cost_necessity="essential",
                recurring_payment_kind="not_recurring",
            ),
            "undecided",
        ),
        "variable_monthly": (
            _tx(
                date(2026, 2, 19),
                -9_000,
                name="conflict-2",
                cost_kind="variable",
                spend_necessity="essential",
                recurring_payment_kind="monthly_recurring",
            ),
            "undecided",
        ),
        "installment_kind_unlinked": (
            _tx(
                date(2026, 2, 21),
                -33_000,
                name="conflict-3",
                recurring_payment_kind="installment",
            ),
            "undecided",
        ),
        "necessity_conflict": (
            _tx(
                date(2026, 2, 23),
                -7_000,
                name="conflict-4",
                cost_kind="fixed",
                fixed_cost_necessity="essential",
                spend_necessity="discretionary",
            ),
            "committed_recurring",
        ),
        "zero_amount": (_tx(date(2026, 2, 22), 0, name="zero"), "undecided"),
        "in_progress_spend": (
            _tx(
                date(2026, 3, 15),
                -20_000,
                name="diner",
                cost_kind="variable",
                spend_necessity="discretionary",
            ),
            "ad_hoc_adjustable",
        ),
        # Rows the metric basis must exclude.
        "deleted": (_tx(date(2026, 1, 11), -999_999, name="deleted"), None),
        "merged": (_tx(date(2026, 1, 12), -888_888, name="merged"), None),
        "superseded_old": (_tx(date(2026, 2, 15), -77_777, name="old-text"), None),
        "superseded_new": (
            _tx(date(2026, 2, 15), -77_777, name="new-text"),
            "undecided",
        ),
        "foreign_currency": (
            _tx(date(2026, 2, 16), -10, name="abroad", currency="USD"),
            None,
        ),
    }
    db_session.add_all([transaction for transaction, _ in rows.values()])
    await db_session.flush()
    ledger.ids = {key: transaction.id for key, (transaction, _) in rows.items()}
    ids = ledger.ids

    rows["deleted"][0].is_deleted = True
    rows["merged"][0].merged_into_id = ids["groceries"]
    rows["superseded_old"][
        0
    ].source_lifecycle_status = TransactionSourceLifecycleStatus.SUPERSEDED.value
    rows["superseded_old"][0].superseded_by_transaction_id = ids["superseded_new"]

    loan_account = LoanAccount(lender="lender-x", product_name="product-x")
    plan = InstallmentPlan(
        display_name="plan-x",
        merchant="shop-i",
        total_installments=3,
        monthly_amount=100_000,
        first_payment_date=date(2026, 1, 15),
    )
    db_session.add_all([loan_account, plan])
    await db_session.flush()
    db_session.add_all(
        [
            LoanTransactionLink(
                transaction_id=ids["loan_payment"], loan_account_id=loan_account.id
            ),
            InstallmentTransactionLink(
                transaction_id=ids["installment_payment"],
                installment_plan_id=plan.id,
                installment_number=1,
            ),
        ]
    )
    now = datetime(2026, 3, 15, tzinfo=UTC)
    db_session.add_all(
        [
            SettlementMatch(
                original_transaction_id=ids["boundary_purchase"],
                settlement_transaction_id=ids["boundary_refund"],
                status="user_confirmed",
                matched_amount=50_000,
                matched_at=now,
            ),
            SettlementMatch(
                original_transaction_id=ids["partial_purchase"],
                settlement_transaction_id=ids["partial_refund"],
                status="user_confirmed",
                matched_amount=40_000,
                matched_at=now,
            ),
            SettlementMatch(
                original_transaction_id=ids["multi_purchase_a"],
                settlement_transaction_id=ids["multi_refund"],
                status="user_confirmed",
                matched_amount=50_000,
                matched_at=now,
            ),
            SettlementMatch(
                original_transaction_id=ids["multi_purchase_b"],
                settlement_transaction_id=ids["multi_refund"],
                status="user_confirmed",
                matched_amount=15_000,
                matched_at=now,
            ),
            # Review-required and rejected matches never move amounts.
            SettlementMatch(
                original_transaction_id=ids["dining"],
                settlement_transaction_id=ids["unallocated_refund"],
                status="review_required",
                matched_amount=5_000,
                matched_at=now,
            ),
        ]
    )
    await db_session.commit()

    excluded = {"deleted", "merged", "superseded_old", "foreign_currency"}
    signed: dict[str, int] = defaultdict(int)
    for key, (transaction, flow_row) in rows.items():
        if key in excluded:
            ledger.excluded_ids.add(transaction.id)
            continue
        ledger.included_ids.add(transaction.id)
        signed[transaction.date.strftime("%Y-%m")] += transaction.amount
        if flow_row is not None:
            ledger.expected_row_by_key[key] = flow_row
    ledger.included_signed_by_period = dict(signed)
    return ledger


async def assert_flow_invariants(
    db_session: AsyncSession, ledger: SyntheticLedger
) -> None:
    """Every won of every included transaction lands in exactly one row."""
    lines = (await db_session.execute(select(FLOW_LINES_VIEW))).mappings().all()
    by_transaction: dict[int, int] = defaultdict(int)
    rows_by_transaction: dict[int, set[str]] = defaultdict(set)
    for line in lines:
        by_transaction[line["transaction_id"]] += int(line["amount"])
        rows_by_transaction[line["transaction_id"]].add(line["flow_row"])

    # (1) Exactly the included transactions appear, each conserving its amount.
    assert set(by_transaction) == ledger.included_ids
    assert not (set(by_transaction) & ledger.excluded_ids)
    raw_amounts = {
        row.id: row.amount
        for row in (
            await db_session.execute(
                select(Transaction.id, Transaction.amount).where(
                    Transaction.id.in_(ledger.included_ids)
                )
            )
        )
    }
    assert dict(by_transaction) == raw_amounts

    # (2) Monthly flow rows sum to the effective-transaction total per month.
    flow_signed: dict[str, int] = defaultdict(int)
    for row in (await db_session.execute(select(MONTHLY_FLOW_VIEW))).mappings():
        flow_signed[row["period"]] += int(row["signed_amount"])
    assert dict(flow_signed) == ledger.included_signed_by_period

    # (3) Summary identities hold for every month.
    summaries = (
        (await db_session.execute(select(MONTHLY_FLOW_SUMMARY_VIEW))).mappings().all()
    )
    assert {row["period"] for row in summaries} == set(ledger.included_signed_by_period)
    for row in summaries:
        assert row["signed_total"] == ledger.included_signed_by_period[row["period"]]
        assert (
            row["income_total"]
            - row["total_outflow"]
            + row["transfer_net"]
            + row["other_type_total"]
            == row["signed_total"]
        )
        assert row["total_outflow"] == (
            row["committed_total"]
            + row["ad_hoc_protected_total"]
            + row["ad_hoc_adjustable_total"]
            + row["undecided_total"]
        )
        assert row["committed_total"] == (
            row["committed_loan_total"]
            + row["committed_installment_total"]
            + row["committed_recurring_total"]
        )
        assert row["total_outflow"] == (
            row["adjustable_spend"]
            + row["protected_spend"]
            + row["adjustability_undecided_total"]
        )
        assert row["living_spend"] == row["total_outflow"] - row["committed_loan_total"]
        assert row["residual"] == row["income_total"] - row["total_outflow"]

    # (4) Single-row transactions land in the expected flow row.
    for key, expected_row in ledger.expected_row_by_key.items():
        assert rows_by_transaction[ledger.ids[key]] == {expected_row}, key
