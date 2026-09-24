from datetime import date, time
from decimal import Decimal

import pytest
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
from app.schemas.income_projection import IncomeExpectation, IncomeExpectationsSettings
from app.services.income_expectations_service import save_income_expectations
from app.services.monthly_projection_service import get_monthly_projection

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
    result = await get_monthly_projection(db_session, reference_date=REFERENCE)
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
    result = await get_monthly_projection(db_session, reference_date=date(2031, 7, 29))
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
    result = await get_monthly_projection(db_session, reference_date=REFERENCE)
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
    result = await get_monthly_projection(db_session, reference_date=REFERENCE)
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
    result = await get_monthly_projection(db_session, reference_date=REFERENCE)
    assert result.expected_remaining_income == 70_000
    assert result.income_sources[0].expected_date == date(2031, 7, 25)
    payload.items[0].stopped = True
    await save_income_expectations(db_session, payload)
    result = await get_monthly_projection(db_session, reference_date=REFERENCE)
    assert result.expected_remaining_income == 0
    assert result.income_sources[0].status == "stopped"
    await save_income_expectations(db_session, IncomeExpectationsSettings())
    result = await get_monthly_projection(db_session, reference_date=REFERENCE)
    assert result.income_sources == []


async def test_no_data_and_stale_partial_coverage_withhold_month_end(db_session):
    result = await get_monthly_projection(db_session, reference_date=REFERENCE)
    assert result.projected_month_end_net is None
    db_session.add(tx(date(2031, 6, 25), 100_000))
    await db_session.commit()
    result = await get_monthly_projection(db_session, reference_date=REFERENCE)
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
    result = await get_monthly_projection(db_session, reference_date=REFERENCE)
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
    result = await get_monthly_projection(db_session, reference_date=REFERENCE)
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
    result = await get_monthly_projection(db_session, reference_date=date(2031, 7, 29))
    source = result.income_sources[0]
    assert source.expected_amount == 100_000
    assert "2031-03" in source.excluded_periods
    assert source.status == "received"
    assert result.observed_income == 100_000
    assert result.expected_remaining_income == 0


async def test_current_recurring_actual_with_changed_classification_is_reconciled(
    db_session,
):
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
    result = await get_monthly_projection(db_session, reference_date=REFERENCE)
    assert (
        next(
            item for item in result.expense_components if item.kind == "recurring"
        ).expected_remaining
        == 0
    )
    assert result.expected_remaining_expense == 300


async def test_unstable_fixed_spend_uses_residual_model_but_explicit_recurring_is_unknown(
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
    result = await get_monthly_projection(db_session, reference_date=REFERENCE)
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
    result = await get_monthly_projection(db_session, reference_date=REFERENCE)
    assert result.projected_month_end_net is None
    assert result.known_expected_remaining_expense == 5_300
    assert result.net_after_known_remaining_expense == 100_000 - 1_700 - 5_300


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
    result = await get_monthly_projection(db_session, reference_date=REFERENCE)
    installment = next(
        item for item in result.expense_components if item.kind == "installment"
    )
    assert installment.expected_remaining is None
    assert installment.known_expected_remaining == 0
    assert "지난" in installment.missing_reasons[0]


async def test_unknown_loan_preserves_known_parts_without_claiming_month_end(
    db_session,
):
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
    result = await get_monthly_projection(db_session, reference_date=REFERENCE)
    assert result.projected_month_end_net is None
    assert result.known_expected_remaining_expense == 5_300
    assert result.net_after_known_remaining_expense == 94_600


async def test_nonmonthly_income_pattern_is_not_extrapolated_every_month(db_session):
    await seed_history(db_session, salary=False)
    for month in (2, 4, 6):
        db_session.add(tx(date(2031, month, 28), 100_000))
    await db_session.commit()
    result = await get_monthly_projection(db_session, reference_date=REFERENCE)
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
    result = await get_monthly_projection(db_session, reference_date=REFERENCE)
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
    result = await get_monthly_projection(db_session, reference_date=date(2031, 7, 26))
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
    result = await get_monthly_projection(db_session, reference_date=REFERENCE)
    assert result.income_sources[0].status == "partial"
    assert result.income_sources[0].remaining_amount == 20_000
    assert result.projected_month_income == 100_000


async def test_unlabeled_bonus_in_latest_month_does_not_mark_regular_salary_stopped(
    db_session,
):
    await seed_history(db_session)
    db_session.add(tx(date(2031, 6, 28), 800_000))
    await db_session.commit()
    result = await get_monthly_projection(db_session, reference_date=REFERENCE)
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
    result = await get_monthly_projection(db_session, reference_date=date(2031, 4, 30))
    assert (
        next(
            item for item in result.expense_components if item.kind == "variable"
        ).expected_remaining
        == 0
    )
    assert result.expected_remaining_expense == 0
    assert result.projected_month_end_net == result.observed_net_cashflow
