from datetime import date, time
from decimal import Decimal

import pytest
from sqlalchemy import exists, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    InstallmentPlan,
    InstallmentTransactionLink,
    Loan,
    LoanAccount,
    LoanMerchantRule,
    LoanTransactionLink,
    Transaction,
    UploadLog,
)
from app.models.nature_axes import RecurringCommitment, TransactionNatureOverride
from app.schemas.income_projection import (
    IncomeExpectation,
    IncomeExpectationsSettings,
    MonthlyProjection,
)
from app.services.income_expectations_service import save_income_expectations
from app.services.monthly_projection_service import get_monthly_projection
from app.services.auto_classification_service import apply_loan_merchant_rules
from app.services.read_commitments_service import read_commitments
from legacy_nature_seed import write_through_legacy_classification


async def classify(db: AsyncSession) -> None:
    """T056 write-through for expense rows nobody classified yet.

    Production reaches the two-axis tables only through this mapping (human
    edits, human rules, the backfill); tests that set the legacy columns
    directly run it the same way before projecting.
    """
    ids = (
        await db.scalars(
            select(Transaction.id).where(
                Transaction.type == "지출",
                ~exists().where(
                    TransactionNatureOverride.transaction_id == Transaction.id
                ),
            )
        )
    ).all()
    await write_through_legacy_classification(db, list(ids))
    await db.commit()


async def project(db: AsyncSession, *, reference_date: date) -> MonthlyProjection:
    await classify(db)
    return await get_monthly_projection(db, reference_date=reference_date)


# Synthetic identities and money; fixed future clock makes scenarios reproducible.
REFERENCE = date(2031, 7, 20)


def tx(on, amount, merchant="Example Payer", category="급여", **values):
    return Transaction(
        date=on,
        time=time(12),
        type=values.pop("type", "수입" if amount > 0 else "지출"),
        merchant=merchant,
        description=values.pop("description", merchant),
        category_major=category,
        amount=amount,
        **values,
    )


async def seed_history(
    db, *, salary=True, split=False, skip_month=None, partial_month=None
):
    for month in range(1, 7):
        if month == skip_month:
            continue
        days = (
            [2, 5, 9, 13, 17, 21, 25, 28]
            if month != partial_month
            else [17, 21, 25, 28]
        )
        for day in days:
            db.add(
                tx(
                    date(2031, month, day),
                    -100,
                    merchant="Example Grocer",
                    category="식비",
                    cost_kind="variable",
                )
            )
        if salary:
            if split:
                db.add(tx(date(2031, month, 15), 40_000))
                db.add(tx(date(2031, month, 28), 60_000))
            else:
                db.add(tx(date(2031, month, 28), 100_000))
            db.add(tx(date(2031, month, 12), 30, description="급여 정산"))
        db.add(
            tx(
                date(2031, month, 25),
                -5_000,
                merchant="Example Recurring",
                category="생활",
                cost_kind="fixed",
                recurring_payment_kind="monthly_recurring",
            )
        )
    db.add(
        tx(
            REFERENCE,
            -100,
            merchant="Example Grocer",
            category="식비",
            cost_kind="variable",
        )
    )
    db.add(
        UploadLog(snapshot_date=REFERENCE, status="success", filename="synthetic.xlsx")
    )
    await db.commit()


async def test_oneoff_income_never_disables_expected_salary(db_session):
    await seed_history(db_session)
    db_session.add_all(
        [
            tx(date(2031, 7, 5), 7, merchant="Example Interest", category="금융수입"),
            tx(date(2031, 7, 6), 900_000, merchant="Example Sale", category="중고판매"),
            tx(date(2031, 3, 28), 800_000, description="성과급 보너스"),
            tx(
                date(2031, 7, 7),
                10_000,
                merchant="Example Refund",
                category="보험",
                type="지출",
            ),
        ]
    )
    await db_session.commit()
    result = await project(db_session, reference_date=REFERENCE)
    assert result.observed_income == 900_007
    assert result.expected_remaining_income == 100_000
    assert result.projected_month_income == 1_000_007
    assert result.income_sources[0].expected_amount == 100_000
    assert result.income_sources[0].expected_date == date(2031, 7, 31)
    assert result.income_sources[0].expected_day == 31
    assert result.income_sources[0].history_periods == [
        f"2031-{m:02}" for m in range(1, 7)
    ]
    assert result.observed_net_expense == -9_900
    assert result.expected_remaining_expense == 5_300
    assert result.projected_month_end_net == 1_004_607
    assert result.coverage.latest_upload_date == REFERENCE
    assert "현재 현금 잔액" in result.limitations[0]


@pytest.mark.parametrize("amounts", [[100_000], [40_000, 60_000], [95_000], [120_000]])
async def test_received_split_or_changed_salary_not_counted_twice(db_session, amounts):
    await seed_history(db_session)
    for amount in amounts:
        db_session.add(tx(date(2031, 7, 28), amount))
    await db_session.commit()
    result = await project(db_session, reference_date=date(2031, 7, 29))
    assert result.observed_income == sum(amounts)
    assert result.expected_remaining_income == 0
    assert result.projected_month_income == sum(amounts)
    assert result.income_sources[0].status == "received"
    assert len(result.income_sources[0].matched_transaction_ids) == len(amounts)


async def test_partial_split_multiple_payers_and_late_salary(db_session):
    await seed_history(db_session, split=True)
    for month in range(1, 7):
        db_session.add(
            tx(date(2031, month, 10), 30_000, merchant="Example Second Payer")
        )
    db_session.add(tx(date(2031, 7, 15), 40_000))
    await db_session.commit()
    result = await project(db_session, reference_date=REFERENCE)
    sources = {source.merchant: source for source in result.income_sources}
    assert sources["Example Payer"].remaining_amount == 60_000
    assert sources["Example Payer"].status == "partial"
    assert sources["Example Payer"].expected_date_from.day == 11
    assert sources["Example Second Payer"].remaining_amount == 30_000
    assert sources["Example Second Payer"].status == "late"
    assert result.expected_remaining_income == 90_000


async def test_missing_partial_months_and_stopped_source(db_session):
    await seed_history(db_session, skip_month=2, partial_month=3)
    june = await db_session.scalar(
        select(Transaction).where(
            Transaction.date == date(2031, 6, 28), Transaction.type == "수입"
        )
    )
    june.is_deleted = True
    await db_session.commit()
    result = await project(db_session, reference_date=REFERENCE)
    assert "2031-02" in result.coverage.missing_periods
    assert "2031-03" in result.coverage.excluded_periods
    assert result.income_sources[0].status == "stopped"
    assert result.income_sources[0].remaining_amount == 0
    assert "2031-06" in result.income_sources[0].excluded_periods


async def test_manual_amount_day_stop_and_reset(db_session):
    await seed_history(db_session, salary=False)
    payload = IncomeExpectationsSettings(
        items=[
            IncomeExpectation(
                source_key="income:example contract",
                merchant="Example Contract",
                expected_amount=70_000,
                expected_day=25,
            )
        ]
    )
    await save_income_expectations(db_session, payload)
    result = await project(db_session, reference_date=REFERENCE)
    assert result.expected_remaining_income == 70_000
    assert result.income_sources[0].expected_date == date(2031, 7, 25)
    payload.items[0].stopped = True
    await save_income_expectations(db_session, payload)
    result = await project(db_session, reference_date=REFERENCE)
    assert result.expected_remaining_income == 0
    assert result.income_sources[0].status == "stopped"
    await save_income_expectations(db_session, IncomeExpectationsSettings())
    result = await project(db_session, reference_date=REFERENCE)
    assert result.income_sources == []


async def test_no_data_and_stale_partial_coverage_withhold_month_end(db_session):
    result = await project(db_session, reference_date=REFERENCE)
    assert result.projected_month_end_net is None
    db_session.add(tx(date(2031, 6, 25), 100_000))
    await db_session.commit()
    result = await project(db_session, reference_date=REFERENCE)
    assert result.projected_month_end_net is None
    assert result.expected_remaining_expense is None
    assert result.confidence == "unavailable"
    assert result.income_sources[0].status == "uncertain"
    assert result.expected_remaining_income == 0


async def test_expenses_partition_and_actual_reconciliation(db_session: AsyncSession):
    await seed_history(db_session)
    account = LoanAccount(lender="Example Bank", product_name="Example Loan")
    loan = Loan(
        snapshot_date=REFERENCE,
        lender=account.lender,
        product_name=account.product_name,
        monthly_payment=Decimal(2_000),
        balance=Decimal(10_000),
        monthly_payment_source="manual",
    )
    plan = InstallmentPlan(
        display_name="Example Plan",
        merchant="Example Device",
        monthly_amount=1_000,
        first_payment_date=date(2031, 1, 25),
        total_installments=12,
        status="active",
    )
    loan_tx = tx(
        date(2031, 7, 10),
        -1_200,
        merchant="Example Bank",
        category="대출",
        cost_kind="fixed",
    )
    installment_tx = tx(
        date(2031, 7, 19),
        -1_000,
        merchant=plan.merchant,
        category="쇼핑",
        cost_kind="fixed",
    )
    db_session.add_all([account, loan, plan, loan_tx, installment_tx])
    await db_session.flush()
    db_session.add(
        LoanTransactionLink(transaction_id=loan_tx.id, loan_account_id=account.id)
    )
    db_session.add(
        InstallmentTransactionLink(
            transaction_id=installment_tx.id,
            installment_plan_id=plan.id,
            installment_number=7,
        )
    )
    await db_session.commit()
    result = await project(db_session, reference_date=REFERENCE)
    assert {
        item.kind: item.expected_remaining for item in result.expense_components
    } == {"loan": 800, "installment": 0, "recurring": 5_000, "variable": 300}
    assert result.observed_net_expense == 2_300
    assert result.projected_month_end_net == 100_000 - (2_300 + 6_100)


async def test_exact_unlinked_installment_is_reconciled_readonly(db_session):
    await seed_history(db_session)
    plan = InstallmentPlan(
        display_name="Example Plan",
        merchant="Example Device",
        monthly_amount=1_000,
        first_payment_date=date(2031, 1, 20),
        total_installments=12,
        status="active",
    )
    db_session.add_all(
        [
            plan,
            tx(
                REFERENCE,
                -1_000,
                merchant=plan.merchant,
                category="쇼핑",
                cost_kind="fixed",
            ),
        ]
    )
    await db_session.commit()
    result = await project(db_session, reference_date=REFERENCE)
    assert (
        next(
            item for item in result.expense_components if item.kind == "installment"
        ).expected_remaining
        == 0
    )
    assert not list(
        (await db_session.scalars(select(InstallmentTransactionLink))).all()
    )


async def test_outlier_salary_and_user_category_overrides_are_respected(db_session):
    await seed_history(db_session)
    db_session.add(tx(date(2031, 3, 28), 800_000))
    db_session.add(
        tx(date(2031, 7, 28), 100_000, category="기타", category_major_user="급여")
    )
    db_session.add(tx(date(2031, 7, 28), 500_000, is_deleted=True))
    await db_session.commit()
    result = await project(db_session, reference_date=date(2031, 7, 29))
    source = result.income_sources[0]
    assert source.expected_amount == 100_000
    assert "2031-03" in source.excluded_periods
    assert source.status == "received"
    assert result.observed_income == 100_000
    assert result.expected_remaining_income == 0


async def test_current_recurring_actual_matching_the_commitment_rule_is_reconciled(
    db_session,
):
    """T064 R6: an imported row joins the registered commitment by its rule."""
    await seed_history(db_session)
    await classify(db_session)
    # Imported, not yet classified by anyone: no legacy value, no override.
    db_session.add(tx(REFERENCE, -5_000, merchant="Example Recurring", category="생활"))
    await db_session.commit()
    result = await get_monthly_projection(db_session, reference_date=REFERENCE)
    recurring = next(
        item for item in result.expense_components if item.kind == "recurring"
    )
    assert recurring.expected_remaining == 0
    assert recurring.sources[0].observed_payment_amount == 5_000
    assert result.expected_remaining_expense == 300


async def test_row_a_person_excluded_from_the_commitment_is_variable_spend(db_session):
    """People classify: an explicit exclusion keeps the commitment's own payment."""
    await seed_history(db_session)
    db_session.add(
        tx(
            REFERENCE,
            -5_000,
            merchant="Example Recurring",
            category="생활",
            cost_kind="variable",
        )
    )
    await db_session.commit()
    result = await project(db_session, reference_date=REFERENCE)
    override = await db_session.scalar(
        select(TransactionNatureOverride).where(
            TransactionNatureOverride.excluded_from_commitments.is_(True)
        )
    )
    assert override is not None
    recurring = next(
        item for item in result.expense_components if item.kind == "recurring"
    )
    assert recurring.sources[0].observed_payment_amount == 0
    assert recurring.expected_remaining == 5_000
    assert result.expected_remaining_expense == 5_300


async def test_commitment_membership_is_per_row_not_per_merchant(db_session):
    """T064 R6: same unit as the monthly flow table (row-level commitment)."""
    await seed_history(db_session)
    for month in range(1, 7):
        db_session.add(
            tx(
                date(2031, month, 26),
                -100,
                merchant="Example Recurring",
                category="식비",
            )
        )
    await db_session.commit()
    result = await project(db_session, reference_date=REFERENCE)
    by_kind = {item.kind: item for item in result.expense_components}
    assert by_kind["recurring"].expected_remaining == 5_000
    assert by_kind["recurring"].sources[0].expected_monthly_amount == 5_000
    assert by_kind["recurring"].sources[0].commitment_id is not None
    assert by_kind["recurring"].sources[0].cycle == "monthly"
    # The other category of the same merchant stays in the variable baseline.
    assert by_kind["variable"].expected_remaining == 400


async def test_unstable_fixed_spend_uses_residual_model_and_new_recurring_is_low_confidence(
    db_session,
):
    await seed_history(db_session)
    db_session.add(
        tx(
            REFERENCE,
            -800,
            merchant="Example Oneoff Fixed",
            category="생활",
            cost_kind="fixed",
        )
    )
    await db_session.commit()
    result = await project(db_session, reference_date=REFERENCE)
    assert result.projected_month_end_net is not None
    db_session.add(
        tx(
            REFERENCE,
            -800,
            merchant="Example New Subscription",
            category="생활",
            recurring_payment_kind="monthly_recurring",
        )
    )
    await db_session.commit()
    result = await project(db_session, reference_date=REFERENCE)
    assert result.projected_month_end_net == 100_000 - 1_700 - 5_300
    assert result.known_expected_remaining_expense == 5_300
    assert result.net_after_known_remaining_expense == 100_000 - 1_700 - 5_300
    assert result.confidence == "low"
    assert result.missing_reasons == []
    assert result.warnings
    recurring = next(
        item for item in result.expense_components if item.kind == "recurring"
    )
    source = next(
        item
        for item in recurring.sources
        if item.merchant == "Example New Subscription"
    )
    assert source.expected_monthly_amount == 800
    assert source.observed_payment_amount == 800
    assert source.expected_remaining == 0
    assert source.confidence == "low"
    assert source.history_periods == []


async def test_past_unlinked_installment_and_overlapping_links_are_not_future_obligations(
    db_session,
):
    await seed_history(db_session)
    plan = InstallmentPlan(
        display_name="Example Overdue",
        merchant="Example Device",
        monthly_amount=1_000,
        first_payment_date=date(2031, 1, 10),
        total_installments=12,
        status="active",
    )
    db_session.add(plan)
    await db_session.commit()
    result = await project(db_session, reference_date=REFERENCE)
    installment = next(
        item for item in result.expense_components if item.kind == "installment"
    )
    assert installment.expected_remaining is None
    assert installment.known_expected_remaining == 0
    assert "지난" in installment.missing_reasons[0]


async def test_unknown_loan_preserves_known_parts_without_claiming_month_end(
    db_session,
):
    """A loan booked as expense with an unknown monthly payment withholds."""
    await seed_history(db_session)
    account = LoanAccount(
        lender="Example Unknown Bank", product_name="Example Unknown Loan"
    )
    repayment = tx(
        date(2031, 6, 10), -1_000, merchant="Example Unknown Bank", category="금융"
    )
    db_session.add_all(
        [
            account,
            repayment,
            Loan(
                snapshot_date=REFERENCE,
                lender="Example Unknown Bank",
                product_name="Example Unknown Loan",
                balance=Decimal(10_000),
            ),
        ]
    )
    await db_session.flush()
    db_session.add(
        LoanTransactionLink(transaction_id=repayment.id, loan_account_id=account.id)
    )
    await db_session.commit()
    result = await project(db_session, reference_date=REFERENCE)
    assert result.projected_month_end_net is None
    assert result.known_expected_remaining_expense == 5_300
    assert result.net_after_known_remaining_expense == 94_600


async def test_loan_without_expense_lines_is_shown_but_not_added(db_session):
    """T064 R1: no account or no expense line -> listed, not assumed."""
    await seed_history(db_session)
    db_session.add(
        Loan(
            snapshot_date=REFERENCE,
            lender="Example Unknown Bank",
            product_name="Example Unknown Loan",
            balance=Decimal(10_000),
        )
    )
    await db_session.commit()
    result = await project(db_session, reference_date=REFERENCE)
    loan = next(item for item in result.expense_components if item.kind == "loan")
    assert loan.expected_remaining == 0
    assert loan.missing_reasons == []
    assert [item.reason_code for item in loan.not_in_expense_commitments] == [
        "no_loan_account"
    ]
    assert loan.not_in_expense_commitments[0].monthly_amount is None
    assert loan.confidence == "low"
    assert result.projected_month_end_net == 100_000 - 100 - 5_300


async def test_nonmonthly_income_pattern_is_not_extrapolated_every_month(db_session):
    await seed_history(db_session, salary=False)
    for month in (2, 4, 6):
        db_session.add(tx(date(2031, month, 28), 100_000))
    await db_session.commit()
    result = await project(db_session, reference_date=REFERENCE)
    assert result.expected_remaining_income == 0
    assert result.income_sources[0].status == "uncertain"
    assert "불연속" in result.income_sources[0].reason


async def test_duplicate_loan_installment_mapping_withholds_uncertain_future(
    db_session,
):
    await seed_history(db_session)
    account = LoanAccount(lender="Example Bank", product_name="Example Loan")
    plan = InstallmentPlan(
        display_name="Example Plan",
        merchant="Example Bank",
        monthly_amount=1_000,
        first_payment_date=date(2031, 1, 20),
        total_installments=12,
        status="active",
    )
    actual = tx(REFERENCE, -1_000, merchant="Example Bank", category="대출")
    db_session.add_all([account, plan, actual])
    await db_session.flush()
    db_session.add_all(
        [
            LoanTransactionLink(transaction_id=actual.id, loan_account_id=account.id),
            InstallmentTransactionLink(
                transaction_id=actual.id,
                installment_plan_id=plan.id,
                installment_number=7,
            ),
        ]
    )
    await db_session.commit()
    result = await project(db_session, reference_date=REFERENCE)
    assert result.projected_month_end_net is None
    installment = next(
        item for item in result.expense_components if item.kind == "installment"
    )
    assert installment.known_expected_remaining == 0
    assert "중복" in installment.missing_reasons[0]


async def test_holiday_shift_and_ambiguous_large_payment_do_not_add_expected_twice(
    db_session,
):
    await seed_history(db_session)
    db_session.add(tx(date(2031, 7, 25), 160_000))
    await db_session.commit()
    result = await project(db_session, reference_date=date(2031, 7, 26))
    assert result.expected_remaining_income == 0
    assert result.income_sources[0].status == "uncertain"
    assert result.income_sources[0].confidence == "low"
    assert result.projected_month_income == 160_000


async def test_eighty_percent_first_split_does_not_erase_later_payment(db_session):
    await seed_history(db_session, salary=False)
    for month in range(1, 7):
        db_session.add(tx(date(2031, month, 15), 80_000))
        db_session.add(tx(date(2031, month, 28), 20_000))
    db_session.add(tx(date(2031, 7, 15), 80_000))
    await db_session.commit()
    result = await project(db_session, reference_date=REFERENCE)
    assert result.income_sources[0].status == "partial"
    assert result.income_sources[0].remaining_amount == 20_000
    assert result.projected_month_income == 100_000


async def test_unlabeled_bonus_in_latest_month_does_not_mark_regular_salary_stopped(
    db_session,
):
    await seed_history(db_session)
    db_session.add(tx(date(2031, 6, 28), 800_000))
    await db_session.commit()
    result = await project(db_session, reference_date=REFERENCE)
    source = result.income_sources[0]
    assert source.expected_amount == 100_000
    assert source.remaining_amount == 100_000
    assert source.status == "expected"
    assert "2031-06" in source.excluded_periods


async def test_short_month_end_has_no_imaginary_day_31_variable_expenses(db_session):
    await seed_history(db_session)
    db_session.add_all(
        [
            tx(
                date(2031, 1, 31),
                -100,
                merchant="Example Month End",
                category="식비",
                cost_kind="variable",
            ),
            tx(
                date(2031, 3, 31),
                -100,
                merchant="Example Month End",
                category="식비",
                cost_kind="variable",
            ),
            tx(
                date(2031, 4, 30),
                -100,
                merchant="Example Current",
                category="식비",
                cost_kind="variable",
            ),
        ]
    )
    await db_session.commit()
    result = await project(db_session, reference_date=date(2031, 4, 30))
    assert (
        next(
            item for item in result.expense_components if item.kind == "variable"
        ).expected_remaining
        == 0
    )
    assert result.expected_remaining_expense == 0
    assert result.projected_month_end_net == result.observed_net_cashflow


@pytest.mark.parametrize("quiet_export", [False, True])
async def test_month_end_reconciles_observed_with_unobserved_payments(
    db_session, quiet_export
):
    end = date(2031, 7, 31)
    await seed_history(db_session, salary=False)
    await save_income_expectations(
        db_session,
        IncomeExpectationsSettings(
            items=[
                IncomeExpectation(
                    source_key="income:late employer",
                    merchant="Late employer",
                    expected_amount=10_000,
                    expected_day=10,
                ),
                IncomeExpectation(
                    source_key="income:split employer",
                    merchant="Split employer",
                    expected_amount=20_000,
                    expected_day=31,
                ),
            ]
        ),
    )
    partial = tx(REFERENCE, -600, merchant="Partial installment", category="쇼핑")
    db_session.add_all([partial, tx(REFERENCE, 5_000, merchant="Split employer")])
    plans = [
        InstallmentPlan(
            display_name=name,
            merchant=name,
            monthly_amount=1_000,
            first_payment_date=date(2031, 7, day),
            total_installments=3,
            status="active",
        )
        for name, day in [
            ("Due at close", 31),
            ("Past due", 15),
            (partial.merchant, 20),
        ]
    ]
    account = LoanAccount(lender="Synthetic Loan Bank", product_name="Synthetic Loan")
    repayment = tx(REFERENCE, -500, merchant=account.lender, category="대출")
    db_session.add_all(
        [
            *plans,
            account,
            repayment,
            Loan(
                snapshot_date=REFERENCE,
                lender=account.lender,
                product_name=account.product_name,
                balance=Decimal(20_000),
                monthly_payment=Decimal(1_000),
            ),
        ]
    )
    await db_session.flush()
    db_session.add_all(
        [
            InstallmentTransactionLink(
                transaction_id=partial.id,
                installment_plan_id=plans[2].id,
                installment_number=1,
            ),
            LoanTransactionLink(
                transaction_id=repayment.id, loan_account_id=account.id
            ),
        ]
    )
    if quiet_export:
        db_session.add(
            UploadLog(snapshot_date=end, status="success", filename="close.xlsx")
        )
    else:
        db_session.add(tx(end, -100, merchant="End transaction", category="식비"))
    await classify(db_session)

    before = await get_monthly_projection(db_session, reference_date=REFERENCE)
    assert before.expected_remaining_income == 25_000
    assert before.known_expected_remaining_expense > 0
    assert before.remaining_period_start == date(2031, 7, 21)

    result = await get_monthly_projection(db_session, reference_date=end)
    assert result.observed_through == (REFERENCE if quiet_export else end)
    assert result.remaining_period_start is None
    assert result.expected_remaining_income == result.expected_remaining_expense == 0
    assert (
        result.known_expected_remaining_expense
        == result.remaining_expense_adjustability.total_amount
        == 0
    )
    assert result.projected_month_income == result.observed_income == 5_000
    assert result.projected_month_expense == result.observed_net_expense
    assert (
        result.projected_month_end_net
        == result.net_after_known_remaining_expense
        == result.observed_net_cashflow
    )
    assert result.completeness.full_projection_available
    assert all(
        item.expected_remaining == item.known_expected_remaining == 0
        for item in result.expense_components
    )
    assert all(
        source.expected_remaining == 0
        for item in result.expense_components
        for source in item.sources
    )
    assert [
        (source.status, source.remaining_amount) for source in result.income_sources
    ] == [("late", 0), ("partial", 0)]
    for plan in plans:
        assert any(plan.display_name in warning for warning in result.warnings)
    assert any(account.lender in warning for warning in result.warnings)


async def test_installment_link_is_read_only_when_payment_date_is_covered(db_session):
    await seed_history(db_session)
    plan = InstallmentPlan(
        display_name="Future installment",
        merchant="Future installment",
        monthly_amount=1_000,
        first_payment_date=REFERENCE,
        total_installments=3,
        status="active",
    )
    payment = tx(date(2031, 7, 21), -1_000, merchant=plan.merchant, category="쇼핑")
    db_session.add_all([plan, payment])
    await db_session.flush()
    db_session.add(
        InstallmentTransactionLink(
            transaction_id=payment.id, installment_plan_id=plan.id, installment_number=1
        )
    )
    await classify(db_session)
    before = await get_monthly_projection(db_session, reference_date=REFERENCE)
    after = await get_monthly_projection(db_session, reference_date=payment.date)
    assert before.expense_components[1].expected_remaining == 1_000
    assert after.expense_components[1].expected_remaining == 0
    assert after.observed_net_expense - before.observed_net_expense == 1_000


@pytest.mark.parametrize("has_old_observation", [False, True])
async def test_empty_month_end_export_keeps_projection_unavailable(
    db_session, has_old_observation
):
    end = date(2031, 7, 31)
    db_session.add(
        UploadLog(snapshot_date=end, status="success", filename="empty.xlsx")
    )
    if has_old_observation:
        db_session.add(tx(date(2031, 6, 30), 1_000))
    await db_session.commit()
    result = await get_monthly_projection(db_session, reference_date=end)
    assert result.remaining_period_start is None
    assert result.known_expected_remaining_expense == 0
    assert result.expected_remaining_expense is None
    assert result.projected_month_end_net is None
    assert not result.completeness.full_projection_available


async def test_forecast_and_auto_apply_choose_merchant_before_description(db_session):
    await seed_history(db_session)
    merchant = LoanAccount(lender="Merchant bank", product_name="Loan")
    description = LoanAccount(lender="Description bank", product_name="Loan")
    db_session.add_all([merchant, description])
    await db_session.flush()
    # The description rule is inserted first and has the lower ID.
    db_session.add_all(
        [
            LoanMerchantRule(
                match_field="description",
                merchant="raw payment",
                loan_account_id=description.id,
                repayment_type="unknown",
            ),
            LoanMerchantRule(
                match_field="merchant",
                merchant="normalized payment",
                loan_account_id=merchant.id,
                repayment_type="unknown",
            ),
        ]
    )
    for account in (merchant, description):
        db_session.add(
            Loan(
                snapshot_date=REFERENCE,
                lender=account.lender,
                product_name=account.product_name,
                balance=Decimal(10_000),
                monthly_payment=Decimal(500),
                monthly_payment_source="manual",
            )
        )
    overlapping = tx(
        REFERENCE,
        -200,
        merchant="normalized payment",
        description="raw payment",
        category="대출",
    )
    fallback = tx(
        REFERENCE,
        -300,
        merchant="different merchant",
        description="raw payment",
        category="대출",
    )
    db_session.add_all([overlapping, fallback])

    before = await project(db_session, reference_date=REFERENCE)
    await apply_loan_merchant_rules(db_session)
    linked_accounts = dict(
        (
            await db_session.execute(
                select(
                    LoanTransactionLink.transaction_id,
                    LoanTransactionLink.loan_account_id,
                )
            )
        ).all()
    )
    assert linked_accounts == {overlapping.id: merchant.id, fallback.id: description.id}
    after = await get_monthly_projection(db_session, reference_date=REFERENCE)
    for projection in (before, after):
        loan = projection.expense_components[0]
        assert {
            source.loan_account_id: source.observed_payment_amount
            for source in loan.sources
        } == {merchant.id: 200, description.id: 300}
        assert loan.expected_remaining == 500


def recurring_source(result, merchant="Example Recurring"):
    return next(
        source
        for component in result.expense_components
        for source in component.sources
        if source.merchant == merchant
    )


def recurring_payment(on, amount, merchant="Example Recurring", **values):
    return tx(
        on,
        amount,
        merchant=merchant,
        category="생활",
        type="지출",
        recurring_payment_kind="monthly_recurring",
        **values,
    )


async def test_finite_recurring_expiry_uses_all_payments_as_of_reference(db_session):
    await seed_history(db_session)
    db_session.add_all(
        [
            recurring_payment(date(2029, 1, 25), -5_000),
            recurring_payment(date(2031, 7, 19), 800),
        ]
    )
    await classify(db_session)
    commitment = await db_session.scalar(
        select(RecurringCommitment).where(
            RecurringCommitment.merchant == "Example Recurring"
        )
    )
    commitment.cycle = "n_times"
    commitment.total_count = 8
    await db_session.commit()

    commitments = await read_commitments(db_session, period="2031-07")
    item = next(item for item in commitments.data.items if item.kind == "recurring")
    assert item.remaining_count == 1
    assert item.linked_count == 8
    before = await get_monthly_projection(db_session, reference_date=REFERENCE)
    source = recurring_source(before)
    assert source.expected_remaining == 5_000
    assert "회차 간격은 기록되어 있지 않아" in source.basis
    assert source.observed_refund_amount == 800

    db_session.add_all(
        [
            recurring_payment(date(2031, 7, 25), -5_000),
            tx(date(2031, 8, 20), -100, merchant="Grocer", category="식비"),
        ]
    )
    await db_session.commit()
    assert before == await get_monthly_projection(db_session, reference_date=REFERENCE)
    finished = await get_monthly_projection(
        db_session, reference_date=date(2031, 7, 25)
    )
    assert recurring_source(finished).observed_payment_amount == 5_000
    assert recurring_source(finished).expected_remaining == 0
    next_month = await get_monthly_projection(
        db_session, reference_date=date(2031, 8, 20)
    )
    assert next_month.expense_components[2].expected_remaining == 0
    assert next_month.expense_components[2].sources == []
    commitments = await read_commitments(db_session, period="2031-08")
    item = next(item for item in commitments.data.items if item.kind == "recurring")
    assert item.remaining_count == 0
    assert item.observation.reason == "all_counts_observed"


async def test_unobserved_finite_interval_does_not_create_a_monthly_payment(db_session):
    commitment = RecurringCommitment(
        match_scope="merchant",
        merchant="Rare payment",
        category_major="생활",
        cycle="n_times",
        total_count=3,
        origin="user",
    )
    db_session.add_all(
        [
            commitment,
            recurring_payment(date(2031, 6, 25), -5_000, commitment.merchant),
            tx(REFERENCE, -100, merchant="Grocer", category="식비"),
        ]
    )
    await db_session.commit()
    projection = await get_monthly_projection(db_session, reference_date=REFERENCE)
    assert projection.expense_components[2].expected_remaining == 0
    assert projection.expense_components[2].sources == []
    commitments = await read_commitments(db_session, period="2031-07")
    (item,) = commitments.data.items
    assert item.remaining_count == 2
    assert item.observation.reason == "cycle_interval_not_recorded"


@pytest.mark.parametrize("history_months", [(6,), (5, 6)])
async def test_short_recurring_history_keeps_numeric_month_end_with_warning(
    db_session, history_months
):
    await seed_history(db_session)
    merchant = "Example Limited History"
    for month in history_months:
        db_session.add(recurring_payment(date(2031, month, 10), -1_000, merchant))
    db_session.add(recurring_payment(date(2031, 7, 10), -1_000, merchant))
    await db_session.commit()
    result = await project(db_session, reference_date=REFERENCE)
    source = recurring_source(result, merchant)
    assert result.projected_month_end_net == 100_000 - 1_100 - 5_300
    assert result.expected_remaining_expense == 5_300
    assert result.known_expected_remaining_expense == 5_300
    assert result.confidence == source.confidence == "low"
    assert result.missing_reasons == []
    assert source.source_key == "expense:example limited history"
    assert source.expected_monthly_amount == 1_000
    assert source.expected_remaining == 0
    assert source.history_periods == [f"2031-{month:02}" for month in history_months]
    assert source.warnings and result.warnings


@pytest.mark.parametrize("latest_problem", ["additional_payment", "missing_payment"])
async def test_current_recurring_uses_earlier_stable_history_when_latest_month_differs(
    db_session, latest_problem
):
    await seed_history(db_session)
    if latest_problem == "additional_payment":
        db_session.add(recurring_payment(date(2031, 6, 5), -5_000))
    else:
        june = await db_session.scalar(
            select(Transaction).where(
                Transaction.date == date(2031, 6, 25),
                Transaction.merchant == "Example Recurring",
            )
        )
        june.is_deleted = True
    db_session.add(recurring_payment(date(2031, 7, 10), -5_000))
    await db_session.commit()
    result = await project(db_session, reference_date=REFERENCE)
    source = recurring_source(result)
    assert source.expected_monthly_amount == 5_000
    assert source.history_periods == [f"2031-{month:02}" for month in range(1, 6)]
    assert "2031-06" in source.excluded_periods
    assert source.expected_remaining == 0
    assert source.confidence == result.confidence == "low"
    assert result.projected_month_end_net == 100_000 - 5_100 - 300
    assert result.missing_reasons == []


@pytest.mark.parametrize(
    ("paid", "refund", "remaining", "additional"),
    [(5_000, 2_000, 0, 0), (0, 2_000, 5_000, 0), (8_000, 1_000, 0, 3_000)],
)
async def test_current_refund_changes_observed_net_but_never_inflates_new_payment(
    db_session, paid, refund, remaining, additional
):
    await seed_history(db_session)
    if paid:
        db_session.add(recurring_payment(date(2031, 7, 10), -paid))
    db_session.add(recurring_payment(date(2031, 7, 15), refund))
    await db_session.commit()
    result = await project(db_session, reference_date=REFERENCE)
    source = recurring_source(result)
    assert source.expected_monthly_amount == 5_000
    assert source.observed_payment_amount == paid
    assert source.observed_refund_amount == refund
    assert source.observed_net_expense == paid - refund
    assert source.additional_observed_amount == additional
    assert source.expected_remaining == remaining
    assert source.confidence == "low"
    assert source.status == "review"
    assert result.observed_net_expense == 100 + paid - refund
    assert result.expected_remaining_expense == remaining + 300
    assert result.projected_month_end_net == 100_000 - (
        100 + paid - refund + remaining + 300
    )
    assert result.missing_reasons == []


async def test_past_refunds_do_not_remove_gross_monthly_payment_pattern(db_session):
    await seed_history(db_session)
    for month in (2, 4, 6):
        db_session.add(recurring_payment(date(2031, month, 27), 5_000))
    await db_session.commit()
    result = await project(db_session, reference_date=REFERENCE)
    source = recurring_source(result)
    assert source.expected_monthly_amount == source.expected_remaining == 5_000
    assert source.confidence == "medium"
    assert source.history_periods == [f"2031-{month:02}" for month in range(1, 7)]
    assert result.observed_net_expense == 100
    assert result.expected_remaining_expense == 5_300


async def test_early_full_payment_prevents_historical_tail_from_counting_it_again(
    db_session,
):
    await seed_history(db_session)
    db_session.add(recurring_payment(date(2031, 7, 5), -5_000))
    await db_session.commit()
    result = await project(db_session, reference_date=REFERENCE)
    source = recurring_source(result)
    assert source.expected_remaining == 0
    assert source.status == "observed"
    assert source.confidence == "medium"
    assert result.expected_remaining_expense == 300


async def test_within_month_split_payment_retains_only_historical_remaining_dates(
    db_session,
):
    await seed_history(db_session)
    merchant = "Example Split Subscription"
    for month in range(1, 7):
        db_session.add_all(
            [
                recurring_payment(date(2031, month, 10), -3_000, merchant),
                recurring_payment(date(2031, month, 25), -2_000, merchant),
            ]
        )
    db_session.add(recurring_payment(date(2031, 7, 10), -3_000, merchant))
    await db_session.commit()
    result = await project(db_session, reference_date=REFERENCE)
    source = recurring_source(result, merchant)
    assert source.expected_monthly_amount == 5_000
    assert source.observed_payment_amount == 3_000
    assert source.expected_remaining == 2_000
    assert source.confidence == "medium"
    assert source.status == "expected"
    assert result.expected_remaining_expense == 7_300
    assert result.projected_month_end_net == 100_000 - 3_100 - 7_300


async def test_small_payment_difference_after_usual_date_is_not_a_future_charge(
    db_session,
):
    await seed_history(db_session)
    db_session.add(recurring_payment(date(2031, 7, 25), -4_950))
    await db_session.commit()
    result = await project(db_session, reference_date=date(2031, 7, 26))
    source = recurring_source(result)
    assert source.expected_monthly_amount == 5_000
    assert source.observed_payment_amount == 4_950
    assert source.expected_remaining == 0
    assert source.confidence == "medium"
    assert source.status == "observed"
    assert source.warnings == []
    assert result.expected_remaining_expense == 100


async def test_missing_substantial_split_after_usual_date_is_visible_for_review(
    db_session,
):
    await seed_history(db_session)
    merchant = "Example Partially Observed Subscription"
    for month in range(1, 7):
        db_session.add_all(
            [
                recurring_payment(date(2031, month, 10), -3_000, merchant),
                recurring_payment(date(2031, month, 25), -2_000, merchant),
            ]
        )
    db_session.add_all(
        [
            recurring_payment(date(2031, 7, 10), -3_000, merchant),
            tx(date(2031, 7, 26), -100, merchant="Example Grocer", category="식비"),
        ]
    )
    await db_session.commit()
    result = await project(db_session, reference_date=date(2031, 7, 26))
    source = recurring_source(result, merchant)
    assert source.expected_monthly_amount == 5_000
    assert source.observed_payment_amount == 3_000
    assert source.expected_remaining == 0
    assert source.confidence == result.confidence == "low"
    assert source.status == "review"
    assert any("미달" in warning for warning in source.warnings)
    assert result.projected_month_end_net is not None
    assert result.missing_reasons == []


async def test_above_baseline_payment_is_observed_not_an_extra_future_obligation(
    db_session,
):
    await seed_history(db_session)
    db_session.add(recurring_payment(date(2031, 7, 5), -8_000))
    await db_session.commit()
    result = await project(db_session, reference_date=REFERENCE)
    source = recurring_source(result)
    assert source.observed_payment_amount == 8_000
    assert source.observed_net_expense == 8_000
    assert source.additional_observed_amount == 3_000
    assert source.expected_remaining == 0
    assert source.status == "review"
    assert source.confidence == result.confidence == "low"
    assert result.observed_net_expense == 8_100
    assert result.projected_month_end_net == 91_600


@pytest.mark.parametrize(("day", "remaining"), [(29, 1_000), (30, 0)])
async def test_recurring_month_end_dates_clamp_to_short_current_month(
    db_session, day, remaining
):
    await seed_history(db_session)
    merchant = "Example Month End Subscription"
    for on in (date(2031, 1, 31), date(2031, 2, 28), date(2031, 3, 31)):
        db_session.add(recurring_payment(on, -1_000, merchant))
    db_session.add(
        tx(date(2031, 4, day), -100, merchant="Example Grocer", category="식비")
    )
    await db_session.commit()
    result = await project(db_session, reference_date=date(2031, 4, day))
    source = recurring_source(result, merchant)
    assert source.expected_remaining == remaining
    assert result.expected_remaining_expense == remaining
    if day == 30:
        assert result.projected_month_end_net == result.observed_net_cashflow


async def test_absent_current_and_latest_month_does_not_revive_old_recurring(
    db_session,
):
    await seed_history(db_session)
    june = await db_session.scalar(
        select(Transaction).where(
            Transaction.date == date(2031, 6, 25),
            Transaction.merchant == "Example Recurring",
        )
    )
    june.is_deleted = True
    await db_session.commit()
    result = await project(db_session, reference_date=REFERENCE)
    recurring = next(
        item for item in result.expense_components if item.kind == "recurring"
    )
    assert recurring.sources == []
    assert recurring.expected_remaining == 0
    assert result.expected_remaining_expense == 300


@pytest.mark.parametrize("has_previous_payment", [True, False])
async def test_incomplete_previous_month_keeps_last_observed_stable_recurring(
    db_session, has_previous_payment
):
    await seed_history(db_session, partial_month=6)
    if not has_previous_payment:
        june = await db_session.scalar(
            select(Transaction).where(
                Transaction.date == date(2031, 6, 25),
                Transaction.merchant == "Example Recurring",
            )
        )
        june.is_deleted = True
        await db_session.commit()
    result = await project(db_session, reference_date=REFERENCE)
    source = recurring_source(result)
    assert result.coverage.adequately_covered_periods == [
        f"2031-{month:02}" for month in range(1, 6)
    ]
    assert source.expected_monthly_amount == 5_000
    assert source.expected_remaining == 5_000
    assert source.history_periods == result.coverage.adequately_covered_periods
    assert "2031-06" in source.excluded_periods
    assert source.observed_payment_amount == 0
    assert source.confidence == result.confidence == "low"
    assert source.status == "review"
    assert any("전체 거래 관측" in warning for warning in source.warnings)
    assert result.expected_remaining_expense == 5_300
    assert result.projected_month_end_net == 94_600
    assert result.missing_reasons == []


async def test_recent_coverage_gap_does_not_revive_prior_observed_missing_recurring(
    db_session,
):
    await seed_history(db_session, partial_month=6)
    recent = list(
        (
            await db_session.scalars(
                select(Transaction).where(
                    Transaction.date >= date(2031, 5, 1),
                    Transaction.merchant == "Example Recurring",
                )
            )
        ).all()
    )
    for row in recent:
        row.is_deleted = True
    await db_session.commit()
    result = await project(db_session, reference_date=REFERENCE)
    assert result.coverage.adequately_covered_periods[-1] == "2031-05"
    assert "2031-06" in result.coverage.excluded_periods
    recurring = next(
        item for item in result.expense_components if item.kind == "recurring"
    )
    assert recurring.sources == []
    assert recurring.expected_remaining == 0
    assert result.expected_remaining_expense == 300


async def test_refund_only_new_recurring_remains_truly_unknown(db_session):
    await seed_history(db_session)
    merchant = "Example Refund Only"
    db_session.add(recurring_payment(date(2031, 7, 10), 800, merchant))
    await db_session.commit()
    result = await project(db_session, reference_date=REFERENCE)
    source = recurring_source(result, merchant)
    assert source.expected_monthly_amount is None
    assert source.expected_remaining is None
    assert source.observed_payment_amount == 0
    assert source.observed_refund_amount == 800
    assert source.observed_net_expense == -800
    assert source.confidence == "unavailable"
    assert result.projected_month_end_net is None
    assert result.expected_remaining_expense is None
    assert result.confidence == "unavailable"
    assert result.observed_net_expense == -700
    assert result.known_expected_remaining_expense == 5_300
    assert result.net_after_known_remaining_expense == 95_400
    assert any("총결제 근거" in reason for reason in result.missing_reasons)


async def test_low_confidence_recurring_does_not_bypass_insufficient_overall_coverage(
    db_session,
):
    db_session.add(recurring_payment(REFERENCE, -1_000))
    await db_session.commit()
    result = await project(db_session, reference_date=REFERENCE)
    source = recurring_source(result)
    assert source.expected_remaining == 0
    assert source.confidence == "low"
    assert result.expected_remaining_expense is None
    assert result.projected_month_end_net is None
    assert any("잔여 변동" in reason for reason in result.missing_reasons)


async def test_incomplete_history_is_not_used_as_a_complete_monthly_baseline(
    db_session,
):
    await seed_history(db_session, partial_month=5)
    merchant = "Example Incomplete History"
    db_session.add_all(
        [
            recurring_payment(date(2031, 5, 20), -9_000, merchant),
            recurring_payment(date(2031, 7, 10), -1_000, merchant),
        ]
    )
    await db_session.commit()
    result = await project(db_session, reference_date=REFERENCE)
    source = recurring_source(result, merchant)
    assert source.expected_monthly_amount == 1_000
    assert source.expected_remaining == 0
    assert source.history_periods == []
    assert "2031-05" in source.excluded_periods
    assert source.confidence == "low"
    assert result.projected_month_end_net is not None


async def test_ambiguous_installment_matches_still_block_month_end(db_session):
    await seed_history(db_session)
    plan = InstallmentPlan(
        display_name="Example Ambiguous Plan",
        merchant="Example Device",
        monthly_amount=1_000,
        first_payment_date=date(2031, 1, 20),
        total_installments=12,
        status="active",
    )
    db_session.add_all(
        [
            plan,
            tx(date(2031, 7, 19), -1_000, merchant=plan.merchant, category="쇼핑"),
            tx(date(2031, 7, 20), -1_000, merchant=plan.merchant, category="쇼핑"),
            recurring_payment(REFERENCE, -800, "Example New Subscription"),
        ]
    )
    await db_session.commit()
    result = await project(db_session, reference_date=REFERENCE)
    assert result.projected_month_end_net is None
    assert result.expected_remaining_expense is None
    assert any("여러 건" in reason for reason in result.missing_reasons)
    assert recurring_source(result, "Example New Subscription").confidence == "low"


async def test_t066_prefix_next_month_and_exact_projection_conservation(db_session):
    """다음 달 다른 끝 숫자도 같은 약정이며 exact 기준 전망 숫자를 보존한다."""
    await seed_history(db_session)
    await classify(db_session)
    commitment = await db_session.scalar(
        select(RecurringCommitment).where(
            RecurringCommitment.merchant == "Example Recurring"
        )
    )
    assert commitment is not None
    db_session.add(tx(REFERENCE, -5_000, merchant="Example Recurring", category="생활"))
    await db_session.commit()
    baseline = await get_monthly_projection(db_session, reference_date=REFERENCE)
    rows = (
        await db_session.scalars(
            select(Transaction).where(Transaction.merchant == "Example Recurring")
        )
    ).all()
    for row in rows:
        row.merchant = f"Example Recurring{row.date.month:02d}"
    commitment.merchant_match = "prefix"
    await db_session.commit()
    after = await get_monthly_projection(db_session, reference_date=REFERENCE)
    assert after.expected_remaining_expense == baseline.expected_remaining_expense
    before_source = recurring_source(baseline)
    after_source = recurring_source(after)
    assert (
        after_source.observed_payment_amount
        == before_source.observed_payment_amount
        == 5_000
    )
    assert after_source.expected_remaining == before_source.expected_remaining == 0
    assert after.projected_month_end_net == baseline.projected_month_end_net
    assert after.model_dump() == baseline.model_dump()
