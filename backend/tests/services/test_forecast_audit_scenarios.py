"""T064 audit: characterization of the month-end forecast.

Each scenario pins what ``get_monthly_projection`` returns. Where the result
is still wrong, a separate ``xfail(strict=True)`` test states the
expected-correct result, so the defect stays recorded and an accidental fix
(or regression of the recorded behavior) is noticed. Round 1 fixes (R3, R9,
R10) and round 2 fixes (R1, R2, R4, R5, R6, R7, R12) turned their xfails into
normal tests; the two F-C2 xfails stay (see their reasons). Synthetic
identities and amounts only.
"""

import calendar
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
from app.schemas.income_projection import (
    IncomeExpectation,
    IncomeExpectationsSettings,
    MonthlyProjection,
    income_source_key,
)
from app.services.income_expectations_service import save_income_expectations
from app.models.nature_axes import RecurringCommitment, TransactionNatureOverride
from app.services.monthly_projection_service import get_monthly_projection
from app.services.nature_axes_service import write_through_legacy_classification
from app.services.settings_service import patch_analytics_settings

SALARY = 100_000


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
    result = await project(db_session, reference_date=reference)
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
    return await project(db, reference_date=reference)


async def test_month_end_salary_crossing_boundary_keeps_regular_income(db_session):
    """T064 R7 (F-I1): the 1 June deposit is May's pay cycle."""
    result = await _salary_crossing_month_boundary(db_session)
    source = result.income_sources[0]
    assert source.cycle_anchor == "month_end"
    assert len(source.cycle_reassigned_transaction_ids) == 1
    assert source.history_periods == [f"2031-{month:02}" for month in range(1, 7)]
    assert source.status == "expected"
    assert source.expected_date == date(2031, 7, 31)
    assert result.expected_remaining_income == SALARY


async def test_late_month_end_salary_this_month_is_last_cycle(db_session):
    """A month-end salary that slid to 1 July is June's, not July's."""
    reference = date(2031, 7, 20)
    await seed(db_session, months=H1, reference=reference, salary_day=None)
    for year, month in H1:
        db_session.add(tx(month_end(year, month), SALARY, "Example Payer", "급여"))
    # June's salary posts on 1 July instead of 30 June.
    june = await db_session.scalar(
        select(Transaction).where(
            Transaction.date == date(2031, 6, 30), Transaction.type == "수입"
        )
    )
    june.date = date(2031, 7, 1)
    await db_session.commit()
    result = await project(db_session, reference_date=reference)
    source = result.income_sources[0]
    assert source.observed_amount == 0
    assert source.remaining_amount == SALARY
    # Observed income still holds the late June salary (monthly flow actual).
    assert result.observed_income == SALARY
    assert result.projected_month_income == 2 * SALARY


async def _month_start_salary(
    db: AsyncSession, *, reference: date
) -> MonthlyProjection:
    """Paid on the 1st/2nd; June's salary arrived early on 30 May."""
    await seed(db, months=H1, reference=reference, salary_day=None)
    for month in range(1, 6):
        db.add(tx(date(2031, month, 2), SALARY, "Example Payer", "급여"))
    db.add(tx(date(2031, 5, 30), SALARY, "Example Payer", "급여"))
    await db.commit()
    return await project(db, reference_date=reference)


async def test_early_month_start_salary_counts_for_its_own_cycle(db_session):
    result = await _month_start_salary(db_session, reference=date(2031, 6, 20))
    source = result.income_sources[0]
    assert source.cycle_anchor == "month_start"
    # June's cycle was already paid on 30 May: nothing more lands in June.
    assert source.status == "received"
    assert source.observed_amount == SALARY
    assert source.remaining_amount == 0
    assert result.observed_income == 0
    assert result.projected_month_income == 0


async def test_month_start_salary_history_stays_continuous(db_session):
    reference = date(2031, 7, 20)
    result = await _month_start_salary(db_session, reference=reference)
    source = result.income_sources[0]
    assert source.history_periods == [f"2031-{month:02}" for month in range(1, 7)]
    assert source.status != "uncertain"


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
    result = await project(db_session, reference_date=reference)
    # Only salary-category words or a user expectation make a regular source.
    assert result.income_sources == []
    assert result.expected_remaining_income == 0
    assert any("정기 수입을 식별할" in reason for reason in result.missing_reasons)


async def test_regular_income_registered_by_a_person_is_forecast(db_session):
    """T064 R8 (partial): a payer a person registered in the income
    expectations is regular income whatever its category; nothing suggests it."""
    reference = date(2031, 7, 20)
    await seed(db_session, months=H1, reference=reference, salary_day=None)
    for year, month in H1:
        db_session.add(
            tx(date(year, month, 28), SALARY, "Example Contractor", "기타수입")
        )
    await db_session.commit()
    await save_income_expectations(
        db_session,
        IncomeExpectationsSettings(
            items=[
                IncomeExpectation(
                    source_key=income_source_key("Example Contractor"),
                    merchant="Example Contractor",
                    expected_amount=SALARY,
                    expected_day=28,
                )
            ]
        ),
    )
    result = await project(db_session, reference_date=reference)
    [source] = result.income_sources
    assert source.status == "expected"
    assert result.expected_remaining_income == SALARY


async def _renamed_salary_payer(db: AsyncSession) -> MonthlyProjection:
    """This month's salary arrives under a new payer name before the as-of."""
    reference = date(2031, 7, 20)
    await seed(db, months=H1, reference=reference)
    db.add(tx(date(2031, 7, 15), SALARY, "Example Payer Renamed", "급여"))
    await db.commit()
    return await project(db, reference_date=reference)


async def test_renamed_salary_payer_withholds_pending_old_source(db_session):
    """T064 R9 (F-I2): the old payer's pending salary is held for review."""
    result = await _renamed_salary_payer(db_session)
    sources = {source.merchant: source for source in result.income_sources}
    assert {name: source.status for name, source in sources.items()} == {
        "Example Payer": "uncertain",
        "Example Payer Renamed": "uncertain",
    }
    old = sources["Example Payer"]
    assert old.expected_amount == SALARY
    assert old.observed_amount == 0
    assert old.remaining_amount == 0
    assert old.confidence == "low"
    assert "입금처 이름이 바뀐" in old.reason
    assert result.observed_income == SALARY
    assert result.projected_month_income == SALARY
    assert any("입금처 이름 변경" in reason for reason in result.missing_reasons)
    # Income-side review never removes the month-end value (audit 2.4).
    assert result.projected_month_end_net is not None
    assert result.confidence == "low"


async def test_expected_renamed_salary_payer_not_counted_twice(db_session):
    result = await _renamed_salary_payer(db_session)
    assert (
        result.projected_month_end_net is None or result.expected_remaining_income == 0
    )


async def test_second_salary_payer_with_history_is_not_treated_as_rename(db_session):
    """A payer with earlier deposits in the window is a separate source."""
    reference = date(2031, 7, 20)
    await seed(db_session, months=H1, reference=reference)
    for year, month in H1:
        db_session.add(tx(date(year, month, 15), 50_000, "Example Side Payer", "급여"))
    db_session.add(tx(date(2031, 7, 15), 50_000, "Example Side Payer", "급여"))
    await db_session.commit()
    result = await project(db_session, reference_date=reference)
    statuses = {source.merchant: source.status for source in result.income_sources}
    assert statuses == {"Example Payer": "expected", "Example Side Payer": "received"}
    assert result.expected_remaining_income == SALARY
    assert not any("입금처 이름 변경" in reason for reason in result.missing_reasons)


async def test_new_payer_registered_in_settings_is_not_treated_as_rename(db_session):
    """A user expectation for the new payer marks it as a separate income."""
    reference = date(2031, 7, 20)
    await seed(db_session, months=H1, reference=reference)
    db_session.add(tx(date(2031, 7, 15), SALARY, "Example New Payer", "급여"))
    await db_session.commit()
    await save_income_expectations(
        db_session,
        IncomeExpectationsSettings(
            items=[
                IncomeExpectation(
                    source_key=income_source_key("Example New Payer"),
                    merchant="Example New Payer",
                    expected_amount=SALARY,
                    expected_day=15,
                )
            ]
        ),
    )
    result = await project(db_session, reference_date=reference)
    statuses = {source.merchant: source.status for source in result.income_sources}
    assert statuses["Example Payer"] == "expected"
    assert result.expected_remaining_income == SALARY


async def test_tiny_new_salary_category_deposit_does_not_withhold(db_session):
    """Below the 10% salary-event floor a new deposit is not a rename signal."""
    reference = date(2031, 7, 20)
    await seed(db_session, months=H1, reference=reference)
    db_session.add(tx(date(2031, 7, 15), SALARY // 20, "Example Adjuster", "급여"))
    await db_session.commit()
    result = await project(db_session, reference_date=reference)
    statuses = {source.merchant: source.status for source in result.income_sources}
    assert statuses["Example Payer"] == "expected"
    assert result.expected_remaining_income == SALARY


# --------------------------------------------------------------------------
# Once-a-year expense (plan scenario).
# --------------------------------------------------------------------------


THIRTEEN_MONTHS = [(2030, month) for month in range(6, 13)] + H1


async def _annual_expense(
    db: AsyncSession,
    *,
    months: list[tuple[int, int]] = THIRTEEN_MONTHS,
    reference: date = date(2031, 7, 10),
    this_month: bool = False,
) -> MonthlyProjection:
    await seed(db, months=months, reference=reference)
    db.add(tx(date(2030, 7, 15), -50_000, "Example Annual Fee", "보험"))
    if this_month:
        db.add(tx(date(2031, 7, 3), -48_000, "Example Annual Fee", "보험"))
    await db.commit()
    return await project(db, reference_date=reference)


async def test_annual_expense_is_in_remaining_assumption(db_session):
    """T064 R4 (F-E1): last year's same-month fee is assumed (12-month window)."""
    result = await _annual_expense(db_session)
    variable = component(result, "variable")
    assert result.expected_remaining_expense == 50_500
    assert variable.expected_remaining == 50_500
    assert variable.twelve_month_window.available is True
    assert variable.twelve_month_window.start_period == "2030-07"
    assert variable.twelve_month_window.end_period == "2031-06"
    [item] = variable.annual_items
    assert item.category == "보험"
    assert item.active_months_in_window == 1
    assert item.last_year_period == "2030-07"
    assert item.last_year_same_month_amount == 50_000
    assert item.expected_remaining == 50_000


async def test_annual_expense_already_paid_this_month_is_not_added(db_session):
    result = await _annual_expense(db_session, this_month=True)
    [item] = component(result, "variable").annual_items
    assert item.observed_this_month == 48_000
    assert item.expected_remaining == 0
    assert result.expected_remaining_expense == 500


async def test_annual_expense_after_its_day_last_year_is_not_added(db_session):
    result = await _annual_expense(db_session, reference=date(2031, 7, 20))
    [item] = component(result, "variable").annual_items
    assert item.expected_remaining == 0
    assert result.expected_remaining_expense == 300


async def test_annual_window_needs_twelve_full_months(db_session):
    """Data starting mid-month 2030-07 leaves the 12-month window incomplete."""
    months = [(2030, month) for month in range(7, 13)] + H1
    result = await _annual_expense(db_session, months=months)
    variable = component(result, "variable")
    assert variable.twelve_month_window.available is False
    assert variable.twelve_month_window.unavailable_reason == "data_start"
    assert variable.annual_items == []
    assert result.expected_remaining_expense == 500


async def test_annual_window_respects_baseline_start_date(db_session):
    await patch_analytics_settings(
        db_session,
        spending_anomalies={},
        comparison={"baseline_start_date": date(2030, 9, 1)},
    )
    result = await _annual_expense(db_session)
    variable = component(result, "variable")
    assert variable.twelve_month_window.unavailable_reason == "baseline_start_date"
    assert result.expected_remaining_expense == 500


async def _yearly_commitment(db: AsyncSession, *, reference: date) -> MonthlyProjection:
    await seed(db, months=THIRTEEN_MONTHS, reference=reference)
    db.add(
        tx(
            date(2030, 7, 15),
            -30_000,
            "Example Yearly Membership",
            "생활",
            cost_kind="fixed",
        )
    )
    await db.commit()
    await classify(db)
    commitment = await db.scalar(
        select(RecurringCommitment).where(
            RecurringCommitment.merchant == "Example Yearly Membership"
        )
    )
    commitment.cycle = "yearly"
    await db.commit()
    return await project(db, reference_date=reference)


async def test_yearly_commitment_is_added_in_its_month(db_session):
    """T064 R4: a commitment a person registered as yearly is assumed in the
    month it was paid last year."""
    result = await _yearly_commitment(db_session, reference=date(2031, 7, 10))
    [source] = component(result, "recurring").sources
    assert source.cycle == "yearly"
    assert source.expected_monthly_amount == 30_000
    assert source.expected_remaining == 30_000
    assert source.history_periods == ["2030-07"]
    assert result.expected_remaining_expense == 30_500


async def test_yearly_commitment_is_not_assumed_in_other_months(db_session):
    result = await _yearly_commitment(db_session, reference=date(2031, 7, 10))
    assert component(result, "variable").annual_items == []
    later = await project(db_session, reference_date=date(2031, 6, 10))
    assert component(later, "recurring").sources == []
    assert later.expected_remaining_expense == 500


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
    return await project(db, reference_date=reference)


async def test_cancelled_explicit_monthly_recurring_is_not_assumed(db_session):
    result = await _cancelled_commitment(db_session, explicit=True)
    assert component(result, "recurring").sources == []
    assert result.expected_remaining_expense == 300


async def test_cancelled_fixed_cost_is_not_assumed(db_session):
    """T064 R5 (F-E2): a stopped commitment's history stays out of variable."""
    result = await _cancelled_commitment(db_session, explicit=False)
    assert component(result, "recurring").sources == []
    assert component(result, "variable").expected_remaining == 300
    assert result.expected_remaining_expense == 300


async def _registered_commitment_with_end(
    db: AsyncSession, *, end: date, reference: date
) -> MonthlyProjection:
    await seed(db, months=H1, reference=reference)
    for month in range(1, 7):
        db.add(
            tx(
                date(2031, month, 25),
                -5_000,
                "Example Subscription",
                "생활",
                cost_kind="fixed",
                recurring_payment_kind="monthly_recurring",
            )
        )
    await db.commit()
    await classify(db)
    commitment = await db.scalar(
        select(RecurringCommitment).where(
            RecurringCommitment.merchant == "Example Subscription"
        )
    )
    commitment.end_date = end
    await db.commit()
    return await project(db, reference_date=reference)


@pytest.mark.parametrize(
    ("end", "remaining"),
    [(date(2031, 6, 30), None), (date(2031, 7, 24), 0), (date(2031, 7, 31), 5_000)],
)
async def test_commitment_end_date_is_followed(db_session, end, remaining):
    """T064 R5: a registered end date stops the assumption at that date."""
    result = await _registered_commitment_with_end(
        db_session, end=end, reference=date(2031, 7, 20)
    )
    recurring = component(result, "recurring")
    if remaining is None:
        assert recurring.sources == []
        assert recurring.expected_remaining == 0
    else:
        source = recurring.sources[0]
        assert source.end_date == end
        assert source.expected_remaining == remaining
        assert source.warnings == []
    # The ended commitment's history never moves into the variable baseline.
    assert component(result, "variable").expected_remaining == 300


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
    result = await project(db_session, reference_date=reference)
    assert component(result, "recurring").expected_remaining == 5_000
    db_session.add(
        tx(date(2031, 7, 26), -100, "Example Grocer", "식비", cost_kind="variable")
    )
    await db_session.commit()
    after_usual_day = await project(db_session, reference_date=date(2031, 7, 26))
    # After the usual day the payment is no longer assumed; a warning remains.
    assert component(after_usual_day, "recurring").expected_remaining == 0
    assert component(after_usual_day, "recurring").sources[0].warnings


async def _quiet_days_after_last_transaction(db: AsyncSession) -> MonthlyProjection:
    """The export covers 26 July, but nothing was spent after 20 July."""
    reference = date(2031, 7, 26)
    await seed(db, months=H1, reference=date(2031, 7, 20))
    db.add(UploadLog(snapshot_date=reference, status="success", filename="y.xlsx"))
    await db.commit()
    return await project(db, reference_date=reference)


async def test_quiet_days_inside_export_are_observed(db_session):
    """T064 R10 (F-O1): the remaining period starts after the upload date."""
    result = await _quiet_days_after_last_transaction(db_session)
    assert result.coverage.latest_upload_date == date(2031, 7, 26)
    assert result.observed_through == date(2031, 7, 20)
    assert result.remaining_period_start == date(2031, 7, 27)


async def test_expected_quiet_days_inside_export_are_not_assumed_again(db_session):
    result = await _quiet_days_after_last_transaction(db_session)
    assert component(result, "variable").expected_remaining == 100


async def test_upload_before_last_transaction_keeps_transaction_day(db_session):
    """The later of the two dates wins; an older upload never moves it back."""
    reference = date(2031, 7, 26)
    await seed(db_session, months=H1, reference=reference)
    db_session.add(
        UploadLog(snapshot_date=date(2031, 7, 22), status="success", filename="z.xlsx")
    )
    await db_session.commit()
    result = await project(db_session, reference_date=reference)
    assert result.observed_through == reference
    assert result.remaining_period_start == date(2031, 7, 27)
    assert component(result, "variable").expected_remaining == 100


async def test_upload_after_as_of_or_in_previous_month_is_ignored(db_session):
    """Only uploads in the reference month and not after the as-of count."""
    reference = date(2031, 7, 20)
    await seed(db_session, months=H1, reference=reference)
    db_session.add(
        UploadLog(snapshot_date=date(2031, 7, 26), status="success", filename="f.xlsx")
    )
    await db_session.commit()
    result = await project(db_session, reference_date=reference)
    assert result.remaining_period_start == date(2031, 7, 21)
    # Day-21 and day-25 grocery tails are still assumed.
    assert component(result, "variable").expected_remaining == 300

    early = await project(db_session, reference_date=date(2031, 7, 1))
    # The previous month's upload and last transaction do not cover July.
    assert early.remaining_period_start == date(2031, 7, 1)


async def test_fully_covered_month_has_no_remaining_period(db_session):
    reference = date(2031, 7, 31)
    await seed(db_session, months=H1, reference=reference)
    result = await project(db_session, reference_date=reference)
    assert result.remaining_period_start is None
    assert component(result, "variable").expected_remaining == 0


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
    marked: bool = False,
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
        extra = {"recurring_payment_kind": "installment"} if marked else {}
        row = tx(date(year, month, 20), -1_000, statement_merchant, "쇼핑", **extra)
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
    return await project(db, reference_date=reference)


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
    reason="T064 F-C2 (kept after round 2): the rows carry another merchant "
    "name, no link and no installment mark, so no person-registered rule ties "
    "them to the plan. Matching by amount and date alone would be inference; a "
    "person links or marks them (see "
    "test_installment_marked_by_a_person_leaves_variable_baseline).",
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
    reason="T064 F-C2 (kept after round 2): after the final installment, rows "
    "no person tied to the plan (other merchant, no link, no mark) stay "
    "ordinary variable spend; see the marked variant for the fixed behaviour.",
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


@pytest.mark.parametrize(
    ("reference", "months", "installment", "total"),
    [
        (date(2031, 7, 10), H1, 1_000, 1_500),
        (date(2031, 8, 10), [(2031, month) for month in range(1, 8)], 0, 500),
    ],
)
async def test_installment_marked_by_a_person_leaves_variable_baseline(
    db_session, reference, months, installment, total
):
    """T064 R2/R6: rows a person marked as installment (link unconfirmed) are
    not variable spend, so the plan schedule is the only assumption."""
    result = await _installment(
        db_session,
        reference=reference,
        months=months,
        linked=False,
        statement_merchant="Example Card Installment",
        marked=True,
    )
    assert component(result, "installment").expected_remaining == installment
    assert result.expected_remaining_expense == total


async def test_unlinked_plan_rule_match_is_shown_as_link_unconfirmed(db_session):
    """T064 R2: a plan-rule match counts once and is marked unconfirmed."""
    months = [(2031, month) for month in range(1, 8)]
    result = await _installment(
        db_session, reference=date(2031, 7, 25), months=months, linked=False
    )
    installment = component(result, "installment")
    assert installment.expected_remaining == 0
    assert installment.link_unconfirmed_count == 1
    assert installment.link_unconfirmed_amount == 1_000
    assert installment.confidence == "low"
    assert installment.warnings[0].startswith("Example Plan: ")
    # Earlier rule matches never reach the variable baseline either.
    assert component(result, "variable").expected_remaining == 100


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
    return await project(db, reference_date=reference)


async def test_installment_link_number_mismatch_only_warns(db_session):
    """T064 R3 (F-C3): the July payment linked as #7 is July's occurrence."""
    result = await _installment_number_off_by_one(db_session)
    installment = component(result, "installment")
    assert result.observed_net_expense == 100 + 1_000
    assert installment.expected_remaining == 0
    assert installment.missing_reasons == []
    assert installment.confidence == "low"
    assert len(installment.warnings) == 1
    assert installment.warnings[0].startswith("Example Plan: ")
    assert "8회차" in installment.warnings[0]
    assert installment.warnings[0] in result.warnings
    assert result.projected_month_end_net is not None
    assert result.confidence == "low"


async def test_expected_linked_installment_of_this_month_not_added_again(db_session):
    result = await _installment_number_off_by_one(db_session)
    assert component(result, "installment").expected_remaining == 0


async def test_linked_installment_of_this_month_with_matching_number_has_no_warning(
    db_session,
):
    months = [(2031, month) for month in range(1, 8)]
    result = await _installment(
        db_session, reference=date(2031, 7, 25), months=months, linked=True
    )
    installment = component(result, "installment")
    assert installment.expected_remaining == 0
    assert installment.warnings == []
    assert installment.confidence == "medium"


async def test_installment_link_number_mismatch_before_this_month_payment(db_session):
    """Before July's payment posts, the computed #8 link is absent: assume it."""
    reference = date(2031, 7, 5)
    await seed(db_session, months=H1, reference=reference)
    plan = InstallmentPlan(
        display_name="Example Plan",
        merchant="Example Device",
        monthly_amount=1_000,
        first_payment_date=date(2030, 12, 20),
        total_installments=12,
        status="active",
    )
    db_session.add(plan)
    await db_session.flush()
    for number, month in enumerate(range(1, 7), start=1):
        row = tx(date(2031, month, 20), -1_000, "Example Device", "쇼핑")
        db_session.add(row)
        await db_session.flush()
        db_session.add(
            InstallmentTransactionLink(
                transaction_id=row.id,
                installment_plan_id=plan.id,
                installment_number=number,
            )
        )
    await db_session.commit()
    result = await project(db_session, reference_date=reference)
    installment = component(result, "installment")
    assert installment.expected_remaining == 1_000
    assert installment.warnings == []


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
    return await project(db, reference_date=reference)


async def test_unlinked_observed_repayment_not_added_again(db_session):
    """T064 R1 (F-C1): a loan with no expense line is not assumed again."""
    result = await _unlinked_observed_repayment(db_session)
    loan = component(result, "loan")
    assert loan.expected_remaining == 0
    assert result.observed_net_expense == 100 + 2_000
    assert result.projected_month_end_net is not None
    assert [item.reason_code for item in loan.not_in_expense_commitments] == [
        "no_expense_line_in_recent_month"
    ]
    assert loan.not_in_expense_commitments[0].monthly_amount == 2_000
    assert loan.not_in_expense_commitments[0].checked_periods == ["2031-06", "2031-07"]
    assert loan.warnings[0].startswith("Example Bank Example Loan: ")


async def _unlinked_repayment_history(db: AsyncSession) -> MonthlyProjection:
    reference = date(2031, 7, 20)
    await seed(db, months=H1, reference=reference)
    await _loan(db)
    for month in range(1, 7):
        db.add(tx(date(2031, month, 25), -2_000, "Example Bank", "대출"))
    await db.commit()
    return await project(db, reference_date=reference)


async def test_unlinked_repayment_history_counts_loan_once(db_session):
    """T064 R1 (F-C1): the unlinked history stays variable, the loan is not added."""
    result = await _unlinked_repayment_history(db_session)
    assert component(result, "loan").expected_remaining == 0
    assert component(result, "variable").expected_remaining == 2_300
    assert result.expected_remaining_expense == 2_300
    assert result.missing_reasons == []


async def _loan_rule_history(db: AsyncSession, *, reference: date) -> MonthlyProjection:
    """A person registered a loan merchant rule but nothing is linked."""
    await seed(db, months=H1, reference=reference)
    await _loan(db)
    await db.flush()
    account = await db.scalar(select(LoanAccount))
    db.add(
        LoanMerchantRule(
            merchant="Example Bank",
            match_field="merchant",
            loan_account_id=account.id,
            repayment_type="unknown",
        )
    )
    for month in range(1, 8):
        on = date(2031, month, 15)
        if on <= reference:
            db.add(tx(on, -2_000, "Example Bank", "대출"))
    await db.commit()
    return await project(db, reference_date=reference)


async def test_loan_rule_match_counts_once_before_payday(db_session):
    """T064 R1: rule-matched history leaves the variable baseline."""
    result = await _loan_rule_history(db_session, reference=date(2031, 7, 10))
    loan = component(result, "loan")
    assert loan.expected_remaining == 2_000
    assert loan.not_in_expense_commitments == []
    assert loan.link_unconfirmed_count == 0
    assert component(result, "variable").expected_remaining == 500
    assert result.expected_remaining_expense == 2_500
    assert result.missing_reasons == []


async def test_loan_rule_match_this_month_is_the_observed_repayment(db_session):
    """T064 R1: this month's rule match is observed, marked link unconfirmed."""
    result = await _loan_rule_history(db_session, reference=date(2031, 7, 20))
    loan = component(result, "loan")
    assert loan.expected_remaining == 0
    assert loan.missing_reasons == []
    assert loan.link_unconfirmed_count == 1
    assert loan.link_unconfirmed_amount == 2_000
    assert loan.confidence == "low"
    assert any("연결 확인 필요" in warning for warning in loan.warnings)
    assert component(result, "variable").expected_remaining == 300
    assert result.projected_month_end_net is not None


async def test_unlinked_loan_category_payment_withholds_only_with_an_added_loan(
    db_session,
):
    """A '대출' payment without link or rule may be an added loan's repayment."""
    reference = date(2031, 7, 20)
    await seed(db_session, months=H1, reference=reference)
    await _loan(db_session)
    await db_session.flush()
    account = await db_session.scalar(select(LoanAccount))
    for month in range(1, 7):
        row = tx(date(2031, month, 15), -2_000, "Example Bank", "대출")
        db_session.add(row)
        await db_session.flush()
        db_session.add(
            LoanTransactionLink(transaction_id=row.id, loan_account_id=account.id)
        )
    db_session.add(tx(date(2031, 7, 15), -2_000, "Example Other Lender", "대출"))
    await db_session.commit()
    result = await project(db_session, reference_date=reference)
    assert component(result, "loan").expected_remaining is None
    assert result.projected_month_end_net is None
    assert any("계좌 연결이 없어" in reason for reason in result.missing_reasons)


async def _repayment_booked_as_transfer(db: AsyncSession) -> MonthlyProjection:
    reference = date(2031, 7, 20)
    await seed(db, months=H1, reference=reference)
    await _loan(db)
    for month in range(1, 7):
        db.add(tx(date(2031, month, 25), -2_000, "Example Bank", "이체", type="이체"))
    await db.commit()
    return await project(db, reference_date=reference)


async def test_repayment_booked_as_transfer_not_added_to_expense(db_session):
    """T064 R1 (F-C4): transfers never reach expense, so the loan is not added."""
    result = await _repayment_booked_as_transfer(db_session)
    loan = component(result, "loan")
    assert loan.expected_remaining == 0
    assert result.expected_remaining_expense == 300
    assert loan.not_in_expense_commitments[0].reason_code == (
        "no_expense_line_in_recent_month"
    )


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
