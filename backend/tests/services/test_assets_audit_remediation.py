from datetime import date, time
from decimal import Decimal

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.asset_snapshot import AssetSnapshot
from app.models.insurance_contract import InsuranceContract
from app.models.loan import Loan
from app.models.loan_account import LoanAccount
from app.models.loan_transaction_link import LoanTransactionLink
from app.models.transaction import Transaction
from app.parsers.snapshots import SnapshotParseResult
from app.services import assets_service
from app.services.upload_service import replace_snapshots


def asset(day: date, name: str, amount: int = 100, **metadata) -> AssetSnapshot:
    return AssetSnapshot(
        snapshot_date=day,
        side="asset",
        category="예금",
        product_name=name,
        amount=Decimal(amount),
        **metadata,
    )


def transaction(day: date, amount: int, *, necessity: str | None = None, **kwargs):
    return Transaction(
        date=day,
        time=time(9),
        type="수입" if amount > 0 else "지출",
        category_major="금융",
        description="test payment",
        merchant="test lender",
        amount=amount,
        spend_necessity=necessity,
        **kwargs,
    )


async def test_all_net_worth_surfaces_share_exclusion_basis_and_preserve_raw(
    db_session: AsyncSession,
) -> None:
    for day, positive, negative in [
        (date(2026, 7, 31), 1000, -200),
        (date(2026, 8, 31), 1500, -300),
    ]:
        db_session.add_all(
            [
                asset(day, "Cash", positive),
                asset(day, "Overdraft", negative),
                # No debt identity matching is claimed by the established policy.
                asset(day, "Unmatched negative source", -25),
                AssetSnapshot(
                    snapshot_date=day,
                    side="liability",
                    category="대출",
                    product_name="Overdraft debt",
                    amount=-negative,
                ),
            ]
        )
    await db_session.commit()
    snapshots = await assets_service.list_asset_snapshots(db_session)
    history = await assets_service.get_net_worth_history(db_session)
    comparison = await assets_service.get_asset_snapshot_comparison(db_session)
    breakdown = await assets_service.get_net_worth_breakdown(db_session)
    assert [item.net_worth for item in snapshots.items] == [800, 1200]
    assert [item.net_worth for item in history.items] == [800, 1200]
    assert comparison.delta.net_worth == 400
    assert comparison.current.net_worth == breakdown.net_worth == 1200
    for response in (
        snapshots.items[-1],
        history.items[-1],
        comparison.current,
        breakdown,
    ):
        assert response.negative_asset_excluded_total == -325
        assert (
            response.aggregation_basis == "nonnegative_asset_rows_minus_liability_rows"
        )
    raw = list((await db_session.scalars(select(AssetSnapshot))).all())
    assert len(raw) == 8
    assert sum(row.amount < 0 for row in raw) == 4
    assert any(item.amount == -300 for item in snapshots.asset_items)


async def test_liquidity_uses_snapshot_bounded_observations_without_debt_overlap(
    db_session: AsyncSession,
) -> None:
    requested_date = date(2026, 8, 22)
    account = LoanAccount(lender="Bank", product_name="Loan")
    july_essential_debt = transaction(date(2026, 7, 12), -300, necessity="essential")
    july_extra_debt = transaction(date(2026, 7, 13), -200)
    july_debt_refund = transaction(date(2026, 7, 14), 50)
    july_debt_refund.type = "지출"
    db_session.add_all(
        [
            asset(requested_date, "Cash", 1),
            account,
            july_essential_debt,
            july_extra_debt,
            july_debt_refund,
            transaction(date(2026, 7, 1), -700, necessity="essential"),
            transaction(date(2026, 7, 25), 2000),
            transaction(date(2026, 6, 25), 1000),
            # Incomplete August, later September and deleted/merged rows are excluded.
            transaction(date(2026, 8, 1), -9000, necessity="essential"),
            transaction(date(2026, 8, 25), 50000),
            transaction(date(2026, 9, 30), -90000, necessity="essential"),
            transaction(date(2026, 9, 30), 90000),
            transaction(
                date(2026, 7, 20), -500, necessity="essential", is_deleted=True
            ),
            Loan(
                snapshot_date=date(2026, 7, 1),
                lender="Bank",
                product_name="Loan",
                monthly_payment=5000,
            ),
            Loan(
                snapshot_date=requested_date,
                lender="Bank",
                product_name="Loan",
                monthly_payment=400,
            ),
            Loan(
                snapshot_date=date(2026, 9, 23),
                lender="Bank",
                product_name="Loan",
                monthly_payment=9000,
            ),
        ]
    )
    await db_session.flush()
    db_session.add_all(
        LoanTransactionLink(transaction_id=tx.id, loan_account_id=account.id)
        for tx in (july_essential_debt, july_extra_debt, july_debt_refund)
    )
    merged = transaction(date(2026, 7, 20), -800, necessity="essential")
    merged.merged_into_id = july_essential_debt.id
    db_session.add(merged)
    await db_session.commit()
    result = await assets_service.get_asset_liability_health(
        db_session, snapshot_date=requested_date
    )
    assert result.monthly_required_spend == 1150  # 700+300+200-50, each once
    assert result.required_spend_essential_total == 1000
    assert result.required_spend_additional_debt_total == 150
    assert result.monthly_debt_payment == 400
    assert result.monthly_income == 1500
    assert result.required_spend_period == "2026-07"
    assert result.input_as_of_date == requested_date
    assert result.debt_payment_snapshot_date == requested_date
    assert result.derived_from_periods == ["2026-06", "2026-07"]
    assert result.emergency_fund_months == pytest.approx(1 / 1150)
    assert result.target_progress_ratio > 0


async def test_liquidity_tiny_positive_runway_is_not_rounded_to_zero(db_session):
    db_session.add(asset(date(2026, 8, 22), "Cash", 1))
    await db_session.commit()
    result = await assets_service.get_asset_liability_health(
        db_session, monthly_required_spend=Decimal("100000000")
    )
    assert result.emergency_fund_months == 0.00000001
    assert result.target_progress_ratio > 0


def snapshots(*names: str) -> SnapshotParseResult:
    return SnapshotParseResult(
        asset_snapshots=[
            {
                "side": "asset",
                "category": "예금",
                "product_name": name,
                "amount": Decimal("200"),
            }
            for name in names
        ],
        investments=[],
        insurance_contracts=[],
        loans=[],
        user_profile=None,
    )


async def test_upload_inherits_unique_prior_metadata_without_resurrecting_resets(
    db_session,
):
    db_session.add_all(
        [
            asset(
                date(2026, 6, 1),
                "Stable",
                liquidity_tier="immediate",
                is_cash_equivalent=True,
            ),
            asset(
                date(2026, 6, 1),
                "Reset",
                liquidity_tier="immediate",
                is_cash_equivalent=True,
            ),
            asset(date(2026, 7, 1), "Reset"),
            asset(
                date(2026, 7, 1),
                "Excluded",
                liquidity_tier="illiquid",
                is_cash_equivalent=False,
            ),
            asset(
                date(2026, 9, 1),
                "Future",
                liquidity_tier="immediate",
                is_cash_equivalent=True,
            ),
        ]
    )
    await db_session.commit()
    target_date = date(2026, 8, 1)
    await replace_snapshots(
        db_session,
        target_date,
        snapshots("Stable", "Reset", "Excluded", "Future", "New"),
    )
    await db_session.commit()
    rows = {
        row.product_name: row
        for row in await db_session.scalars(
            select(AssetSnapshot).where(AssetSnapshot.snapshot_date == target_date)
        )
    }
    assert (rows["Stable"].liquidity_tier, rows["Stable"].is_cash_equivalent) == (
        "immediate",
        True,
    )
    assert (rows["Excluded"].liquidity_tier, rows["Excluded"].is_cash_equivalent) == (
        "illiquid",
        False,
    )
    for name in ("Reset", "Future", "New"):
        assert rows[name].liquidity_tier is None
        assert rows[name].is_cash_equivalent is None


@pytest.mark.parametrize(
    "prior_duplicate,incoming_duplicate", [(True, False), (False, True), (True, True)]
)
async def test_upload_does_not_inherit_ambiguous_asset_names(
    db_session, prior_duplicate, incoming_duplicate
):
    db_session.add(
        asset(
            date(2026, 7, 1),
            "Deposit",
            liquidity_tier="immediate",
            is_cash_equivalent=True,
        )
    )
    if prior_duplicate:
        db_session.add(
            asset(
                date(2026, 7, 1),
                "Deposit (2)",
                liquidity_tier="illiquid",
                is_cash_equivalent=False,
            )
        )
    await db_session.commit()
    names = ("Deposit", "Deposit") if incoming_duplicate else ("Deposit",)
    await replace_snapshots(db_session, date(2026, 8, 1), snapshots(*names))
    await db_session.commit()
    rows = list(
        await db_session.scalars(
            select(AssetSnapshot).where(AssetSnapshot.snapshot_date == date(2026, 8, 1))
        )
    )
    assert len(rows) == len(names)
    assert all(
        row.liquidity_tier is None and row.is_cash_equivalent is None for row in rows
    )


async def test_same_date_replacement_preserves_null_false_and_metadata(db_session):
    day = date(2026, 8, 1)
    db_session.add_all(
        [
            asset(
                date(2026, 7, 1),
                "Automatic",
                liquidity_tier="immediate",
                is_cash_equivalent=True,
            ),
            asset(day, "Automatic"),
            asset(
                day, "Excluded", liquidity_tier="near_liquid", is_cash_equivalent=False
            ),
            asset(day, "Included", liquidity_tier="immediate", is_cash_equivalent=True),
        ]
    )
    await db_session.commit()
    await replace_snapshots(
        db_session, day, snapshots("Automatic", "Excluded", "Included")
    )
    await db_session.commit()
    rows = {
        row.product_name: row
        for row in await db_session.scalars(
            select(AssetSnapshot).where(AssetSnapshot.snapshot_date == day)
        )
    }
    assert rows["Automatic"].liquidity_tier is None
    assert rows["Automatic"].is_cash_equivalent is None
    assert (rows["Excluded"].liquidity_tier, rows["Excluded"].is_cash_equivalent) == (
        "near_liquid",
        False,
    )
    assert (rows["Included"].liquidity_tier, rows["Included"].is_cash_equivalent) == (
        "immediate",
        True,
    )
    assert all(row.amount == 200 for row in rows.values())


async def test_historical_insurance_premium_does_not_read_future_transactions(
    db_session,
):
    past = date(2026, 8, 22)
    july = transaction(date(2026, 7, 20), -100)
    july.category_major = "보험"
    august = transaction(date(2026, 8, 30), -900)
    august.category_major = "보험"
    db_session.add_all(
        [
            InsuranceContract(
                snapshot_date=past, insurer="Insurer", product_name="Policy"
            ),
            july,
            august,
        ]
    )
    await db_session.commit()
    result = await assets_service.get_insurance_summary(db_session, past)
    assert result.monthly_premium_estimate.amount == 100
    assert result.monthly_premium_estimate.period == "2026-07"
    assert result.monthly_premium_estimate.basis["input_as_of_date"] == "2026-08-22"
