"""T064 audit: characterization of the CURRENT month-end forecast.

Each scenario pins what ``get_monthly_projection`` returns today. Where the
current result is wrong, a separate ``xfail(strict=True)`` test states the
expected-correct result, so the defect stays recorded and an accidental fix
(or regression of the recorded behavior) is noticed. Nothing here changes the
forecast. Synthetic identities and amounts only.
"""

import calendar
from datetime import date, time
from decimal import Decimal

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    InstallmentPlan,
    InstallmentTransactionLink,
    Loan,
    LoanAccount,
    Transaction,
    UploadLog,
)
from app.schemas.income_projection import MonthlyProjection
from app.services.monthly_projection_service import get_monthly_projection

SALARY = 100_000
GROCERY_DAYS = (2, 5, 9, 13, 17, 21, 25, 28)


def tx(on: date, amount: int, merchant: str, category: str, **values) -> Transaction:
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


def month_end(year: int, month: int) -> date:
    return date(year, month, calendar.monthrange(year, month)[1])


async def seed(
    db: AsyncSession,
    *,
    months: list[tuple[int, int]],
    reference: date,
    salary_day: int | None = 28,
) -> None:
    """Grocery on eight days of every month (coverage), optional salary."""
    for year, month in months:
        for day in GROCERY_DAYS:
            db.add(
                tx(
                    date(year, month, day),
                    -100,
                    "Example Grocer",
                    "식비",
                    cost_kind="variable",
                )
            )
        if salary_day is not None:
            db.add(tx(date(year, month, salary_day), SALARY, "Example Payer", "급여"))
    # The as-of day itself is observed, so observed_day == reference.day.
    db.add(tx(reference, -100, "Example Grocer", "식비", cost_kind="variable"))
    db.add(UploadLog(snapshot_date=reference, status="success", filename="x.xlsx"))
    await db.commit()


H1 = [(2031, month) for month in range(1, 7)]


def component(result: MonthlyProjection, kind: str):
    return next(item for item in result.expense_components if item.kind == kind)


# --------------------------------------------------------------------------
# Month-end salary (plan scenario) and regular income before payday.
# --------------------------------------------------------------------------


async def test_month_end_salary_is_expected_before_payday(db_session):
    reference = date(2031, 7, 20)
    await seed(db_session, months=H1, reference=reference, salary_day=None)
    for year, month in H1:
        db_session.add(tx(month_end(year, month), SALARY, "Example Payer", "급여"))
    await db_session.commit()
    result = await get_monthly_projection(db_session, reference_date=reference)
    source = result.income_sources[0]
    assert source.status == "expected"
    assert source.expected_date == date(2031, 7, 31)
    assert result.expected_remaining_income == SALARY
    assert result.projected_month_income == SALARY


async def _salary_crossing_month_boundary(db: AsyncSession) -> MonthlyProjection:
    """May's month-end salary posts on 1 June (weekend/holiday shift)."""
    reference = date(2031, 7, 20)
    await seed(db, months=H1, reference=reference, salary_day=None)
    for on in (
        month_end(2031, 1),
        month_end(2031, 2),
        month_end(2031, 3),
        month_end(2031, 4),
        date(2031, 6, 1),
        month_end(2031, 6),
    ):
        db.add(tx(on, SALARY, "Example Payer", "급여"))
    await db.commit()
    return await get_monthly_projection(db, reference_date=reference)


async def test_current_month_end_salary_crossing_boundary_drops_regular_income(
    db_session,
):
    result = await _salary_crossing_month_boundary(db_session)
    source = result.income_sources[0]
    assert source.expected_amount == SALARY
    assert source.history_periods == ["2031-01", "2031-02", "2031-03", "2031-04"]
    assert source.status == "uncertain"
    assert "불연속" in source.reason
    assert result.expected_remaining_income == 0


@pytest.mark.xfail(
    strict=True,
    reason="T064 F-I1: one month-end salary posted on the 1st of the next month "
    "makes May empty and June double, and the continuity rule then drops the "
    "regular salary for about three months.",
)
async def test_expected_month_end_salary_crossing_boundary_keeps_regular_income(
    db_session,
):
    result = await _salary_crossing_month_boundary(db_session)
    assert result.expected_remaining_income == SALARY


async def test_current_regular_income_outside_salary_category_is_not_forecast(
    db_session,
):
    reference = date(2031, 7, 20)
    await seed(db_session, months=H1, reference=reference, salary_day=None)
    for year, month in H1:
        db_session.add(
            tx(date(year, month, 28), SALARY, "Example Contractor", "기타수입")
        )
    await db_session.commit()
    result = await get_monthly_projection(db_session, reference_date=reference)
    # Only salary-category words or a user expectation make a regular source.
    assert result.income_sources == []
    assert result.expected_remaining_income == 0
    assert any("정기 수입을 식별할" in reason for reason in result.missing_reasons)


# --------------------------------------------------------------------------
# Once-a-year expense (plan scenario).
# --------------------------------------------------------------------------


async def _annual_expense(db: AsyncSession) -> MonthlyProjection:
    reference = date(2031, 7, 10)
    months = [(2030, month) for month in range(7, 13)] + H1
    await seed(db, months=months, reference=reference)
    db.add(tx(date(2030, 7, 15), -50_000, "Example Annual Fee", "보험"))
    await db.commit()
    return await get_monthly_projection(db, reference_date=reference)


async def test_current_annual_expense_is_not_in_remaining_assumption(db_session):
    result = await _annual_expense(db_session)
    # Only the six-month window is read; last year's same-month fee is ignored.
    assert result.expected_remaining_expense == 500
    assert component(result, "variable").expected_remaining == 500


@pytest.mark.xfail(
    strict=True,
    reason="T064 F-E1: the forecast reads only six months, so a fee paid once a "
    "year in this month is never assumed (plan 2.4 asks for a 12-month window).",
)
async def test_expected_annual_expense_is_in_remaining_assumption(db_session):
    result = await _annual_expense(db_session)
    assert result.expected_remaining_expense == 50_500


# --------------------------------------------------------------------------
# Commitment cancelled mid-way (plan scenario).
# --------------------------------------------------------------------------


async def _cancelled_commitment(
    db: AsyncSession, *, explicit: bool
) -> MonthlyProjection:
    reference = date(2031, 7, 20)
    await seed(db, months=H1, reference=reference)
    extra = {"recurring_payment_kind": "monthly_recurring"} if explicit else {}
    for month in range(1, 5):  # paid January-April, cancelled from May
        db.add(
            tx(
                date(2031, month, 25),
                -5_000,
                "Example Subscription",
                "생활",
                cost_kind="fixed",
                **extra,
            )
        )
    await db.commit()
    return await get_monthly_projection(db, reference_date=reference)


async def test_cancelled_explicit_monthly_recurring_is_not_assumed(db_session):
    result = await _cancelled_commitment(db_session, explicit=True)
    assert component(result, "recurring").sources == []
    assert result.expected_remaining_expense == 300


async def test_current_cancelled_fixed_cost_falls_back_to_variable_baseline(
    db_session,
):
    result = await _cancelled_commitment(db_session, explicit=False)
    assert component(result, "recurring").sources == []
    # Four of six baseline months still contain the cancelled payment.
    assert component(result, "variable").expected_remaining == 5_300
    assert result.expected_remaining_expense == 5_300


@pytest.mark.xfail(
    strict=True,
    reason="T064 F-E2: a fixed-cost payment that stopped is moved into the "
    "variable baseline, whose median still contains it while it is in at least "
    "half of the six months.",
)
async def test_expected_cancelled_fixed_cost_is_not_assumed(db_session):
    result = await _cancelled_commitment(db_session, explicit=False)
    assert result.expected_remaining_expense == 300


async def test_recurring_cancelled_this_month_is_still_assumed_before_its_day(
    db_session,
):
    """Limitation, not a code defect: nothing records the cancellation yet."""
    reference = date(2031, 7, 20)
    await seed(db_session, months=H1, reference=reference)
    for month in range(1, 7):
        db_session.add(
            tx(
                date(2031, month, 25),
                -5_000,
                "Example Subscription",
                "생활",
                cost_kind="fixed",
                recurring_payment_kind="monthly_recurring",
            )
        )
    await db_session.commit()
    result = await get_monthly_projection(db_session, reference_date=reference)
    assert component(result, "recurring").expected_remaining == 5_000
    db_session.add(
        tx(date(2031, 7, 26), -100, "Example Grocer", "식비", cost_kind="variable")
    )
    await db_session.commit()
    after_usual_day = await get_monthly_projection(
        db_session, reference_date=date(2031, 7, 26)
    )
    # After the usual day the payment is no longer assumed; a warning remains.
    assert component(after_usual_day, "recurring").expected_remaining == 0
    assert component(after_usual_day, "recurring").sources[0].warnings


async def _quiet_days_after_last_transaction(db: AsyncSession) -> MonthlyProjection:
    """The export covers 26 July, but nothing was spent after 20 July."""
    reference = date(2031, 7, 26)
    await seed(db, months=H1, reference=date(2031, 7, 20))
    db.add(UploadLog(snapshot_date=reference, status="success", filename="y.xlsx"))
    await db.commit()
    return await get_monthly_projection(db, reference_date=reference)


async def test_current_quiet_days_after_last_transaction_count_as_unobserved(
    db_session,
):
    result = await _quiet_days_after_last_transaction(db_session)
    assert result.coverage.latest_upload_date == date(2031, 7, 26)
    assert result.observed_through == date(2031, 7, 20)
    # Days 21-26 are inside the export but still get the day-21/25 tail.
    assert component(result, "variable").expected_remaining == 300


@pytest.mark.xfail(
    strict=True,
    reason="T064 F-O1: the remaining period starts after the last transaction "
    "date, not after the export coverage date, so quiet days already covered "
    "by the upload are assumed again.",
)
async def test_expected_quiet_days_inside_export_are_not_assumed_again(db_session):
    result = await _quiet_days_after_last_transaction(db_session)
    assert component(result, "variable").expected_remaining == 100


# --------------------------------------------------------------------------
# Month the installment ends (plan scenario).
# --------------------------------------------------------------------------


async def _installment(
    db: AsyncSession,
    *,
    reference: date,
    months: list[tuple[int, int]],
    linked: bool,
    statement_merchant: str = "Example Device",
) -> MonthlyProjection:
    await seed(db, months=months, reference=reference)
    plan = InstallmentPlan(
        display_name="Example Plan",
        merchant="Example Device",
        monthly_amount=1_000,
        first_payment_date=date(2031, 1, 20),
        total_installments=7,  # January .. July
        status="active",
    )
    db.add(plan)
    await db.flush()
    for number, (year, month) in enumerate(months, start=1):
        if number > 7:
            break
        row = tx(date(year, month, 20), -1_000, statement_merchant, "쇼핑")
        db.add(row)
        await db.flush()
        if linked:
            db.add(
                InstallmentTransactionLink(
                    transaction_id=row.id,
                    installment_plan_id=plan.id,
                    installment_number=number,
                )
            )
    await db.commit()
    return await get_monthly_projection(db, reference_date=reference)


async def test_linked_installment_last_month_and_after_end(db_session):
    result = await _installment(
        db_session, reference=date(2031, 7, 10), months=H1, linked=True
    )
    assert component(result, "installment").expected_remaining == 1_000
    assert result.expected_remaining_expense == 1_500


async def test_linked_installment_after_final_month_is_not_assumed(db_session):
    months = [(2031, month) for month in range(1, 8)]
    result = await _installment(
        db_session, reference=date(2031, 8, 10), months=months, linked=True
    )
    assert component(result, "installment").expected_remaining == 0
    assert result.expected_remaining_expense == 500


async def test_current_unmatched_installment_counted_in_schedule_and_variable(
    db_session,
):
    result = await _installment(
        db_session,
        reference=date(2031, 7, 10),
        months=H1,
        linked=False,
        statement_merchant="Example Card Installment",
    )
    assert component(result, "installment").expected_remaining == 1_000
    assert component(result, "variable").expected_remaining == 1_500
    assert result.expected_remaining_expense == 2_500


@pytest.mark.xfail(
    strict=True,
    reason="T064 F-C2: installment rows that are neither linked nor an exact "
    "plan match stay in the variable baseline while the plan schedule adds the "
    "same installment again.",
)
async def test_expected_unmatched_installment_counted_once(db_session):
    result = await _installment(
        db_session,
        reference=date(2031, 7, 10),
        months=H1,
        linked=False,
        statement_merchant="Example Card Installment",
    )
    assert result.expected_remaining_expense == 1_500


async def test_current_unmatched_installment_after_final_month_still_assumed(
    db_session,
):
    months = [(2031, month) for month in range(1, 8)]
    result = await _installment(
        db_session,
        reference=date(2031, 8, 10),
        months=months,
        linked=False,
        statement_merchant="Example Card Installment",
    )
    assert component(result, "installment").expected_remaining == 0
    assert result.expected_remaining_expense == 1_500


@pytest.mark.xfail(
    strict=True,
    reason="T064 F-C2: after the final installment, unmatched historical "
    "installment rows keep the ended plan alive through the variable baseline.",
)
async def test_expected_unmatched_installment_after_final_month_not_assumed(
    db_session,
):
    months = [(2031, month) for month in range(1, 8)]
    result = await _installment(
        db_session,
        reference=date(2031, 8, 10),
        months=months,
        linked=False,
        statement_merchant="Example Card Installment",
    )
    assert result.expected_remaining_expense == 500


async def _installment_number_off_by_one(db: AsyncSession) -> MonthlyProjection:
    """The plan's first month is one month earlier than the posted months."""
    reference = date(2031, 7, 10)
    await seed(db, months=H1, reference=reference)
    plan = InstallmentPlan(
        display_name="Example Plan",
        merchant="Example Device",
        monthly_amount=1_000,
        first_payment_date=date(2030, 12, 20),
        total_installments=12,
        status="active",
    )
    db.add(plan)
    await db.flush()
    posted = [date(2031, month, 20) for month in range(1, 7)] + [date(2031, 7, 8)]
    for number, on in enumerate(posted, start=1):
        row = tx(on, -1_000, "Example Device", "쇼핑")
        db.add(row)
        await db.flush()
        db.add(
            InstallmentTransactionLink(
                transaction_id=row.id,
                installment_plan_id=plan.id,
                installment_number=number,
            )
        )
    await db.commit()
    return await get_monthly_projection(db, reference_date=reference)


async def test_current_installment_link_number_mismatch_adds_paid_installment_again(
    db_session,
):
    result = await _installment_number_off_by_one(db_session)
    # July's installment (#7) is linked and observed, but the schedule looks
    # for #8 in July, finds no link, and adds the monthly amount again.
    assert result.observed_net_expense == 100 + 1_000
    assert component(result, "installment").expected_remaining == 1_000


@pytest.mark.xfail(
    strict=True,
    reason="T064 F-C3: the schedule matches links only by computed installment "
    "number; a linked payment of this month with another number is added again.",
)
async def test_expected_linked_installment_of_this_month_not_added_again(db_session):
    result = await _installment_number_off_by_one(db_session)
    assert component(result, "installment").expected_remaining == 0


# --------------------------------------------------------------------------
# Loan repayment double counting (plan check (b)).
# --------------------------------------------------------------------------


async def _loan(db: AsyncSession) -> None:
    db.add(LoanAccount(lender="Example Bank", product_name="Example Loan"))
    db.add(
        Loan(
            snapshot_date=date(2030, 12, 31),
            lender="Example Bank",
            product_name="Example Loan",
            monthly_payment=Decimal(2_000),
            balance=Decimal(100_000),
            monthly_payment_source="manual",
        )
    )


async def _unlinked_observed_repayment(db: AsyncSession) -> MonthlyProjection:
    reference = date(2031, 7, 20)
    await seed(db, months=H1, reference=reference)
    await _loan(db)
    db.add(tx(date(2031, 7, 5), -2_000, "Example Bank", "금융"))
    await db.commit()
    return await get_monthly_projection(db, reference_date=reference)


async def test_current_unlinked_observed_repayment_is_added_again(db_session):
    result = await _unlinked_observed_repayment(db_session)
    assert component(result, "loan").expected_remaining == 2_000
    assert result.observed_net_expense == 100 + 2_000
    assert result.projected_month_end_net is not None


@pytest.mark.xfail(
    strict=True,
    reason="T064 F-C1: without a loan link the observed repayment is not "
    "recognised (only a '대출' category text withholds the forecast), so the "
    "snapshot monthly payment is added on top of it.",
)
async def test_expected_unlinked_observed_repayment_not_added_again(db_session):
    result = await _unlinked_observed_repayment(db_session)
    assert (
        result.projected_month_expense is None
        or component(result, "loan").expected_remaining == 0
    )


async def _unlinked_repayment_history(db: AsyncSession) -> MonthlyProjection:
    reference = date(2031, 7, 20)
    await seed(db, months=H1, reference=reference)
    await _loan(db)
    for month in range(1, 7):
        db.add(tx(date(2031, month, 25), -2_000, "Example Bank", "대출"))
    await db.commit()
    return await get_monthly_projection(db, reference_date=reference)


async def test_current_unlinked_repayment_history_counts_loan_twice_before_payday(
    db_session,
):
    result = await _unlinked_repayment_history(db_session)
    assert component(result, "loan").expected_remaining == 2_000
    assert component(result, "variable").expected_remaining == 2_300
    assert result.expected_remaining_expense == 4_300
    assert result.missing_reasons == []


@pytest.mark.xfail(
    strict=True,
    reason="T064 F-C1: unlinked past repayments sit in the variable baseline "
    "while the loan snapshot adds the same repayment again before payday.",
)
async def test_expected_unlinked_repayment_history_counts_loan_once(db_session):
    result = await _unlinked_repayment_history(db_session)
    assert result.expected_remaining_expense == 2_300


async def _repayment_booked_as_transfer(db: AsyncSession) -> MonthlyProjection:
    reference = date(2031, 7, 20)
    await seed(db, months=H1, reference=reference)
    await _loan(db)
    for month in range(1, 7):
        db.add(tx(date(2031, month, 25), -2_000, "Example Bank", "이체", type="이체"))
    await db.commit()
    return await get_monthly_projection(db, reference_date=reference)


async def test_current_repayment_booked_as_transfer_is_added_to_expense(db_session):
    result = await _repayment_booked_as_transfer(db_session)
    # Transfers never reach expense actuals, yet the loan schedule is added.
    assert component(result, "loan").expected_remaining == 2_000
    assert result.expected_remaining_expense == 2_300


@pytest.mark.xfail(
    strict=True,
    reason="T064 F-C4: the loan component trusts the snapshot monthly payment "
    "even when this ledger books the repayments as transfers (or not at all), "
    "so the forecast unit differs from the monthly-flow actual.",
)
async def test_expected_repayment_booked_as_transfer_not_added_to_expense(
    db_session,
):
    result = await _repayment_booked_as_transfer(db_session)
    assert component(result, "loan").expected_remaining == 0


# --------------------------------------------------------------------------
# Plan 2.6 response requirements.
# --------------------------------------------------------------------------


@pytest.mark.xfail(
    strict=True,
    reason="T064 F-R1: plan 2.6 asks the forecast to show the undecided "
    "adjustability share; the response has no such field.",
)
def test_expected_projection_reports_undecided_adjustability_share():
    assert any("undecided" in name for name in MonthlyProjection.model_fields)
