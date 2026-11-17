from datetime import date, time

import pytest
from sqlalchemy import func, select

from app.models.installment_plan import InstallmentPlan
from app.models.installment_transaction_link import InstallmentTransactionLink
from app.models.transaction import Transaction
from app.services.installment_plan_match import match_installment_plan
from app.services.installment_suggestion_service import (
    _match_transaction_to_plan,
    list_installment_transaction_suggestions,
)
from app.services.monthly_projection_service import (
    _plan_matches,
    get_monthly_projection,
)


def plan(first: date = date(2031, 5, 30)) -> InstallmentPlan:
    return InstallmentPlan(
        id=1,
        display_name="Example Device Plan",
        merchant="Example Store",
        payment_method="Example Card",
        first_payment_date=first,
        monthly_amount=50_000,
        total_installments=3,
        status="active",
    )


def transaction(on: date, **values) -> Transaction:
    return Transaction(
        id=1,
        date=on,
        time=time(12),
        type="지출",
        category_major="Example Shopping",
        merchant=values.pop("merchant", "  EXAMPLE   Store "),
        description="Example Device Payment",
        payment_method=values.pop("payment_method", "Example Card"),
        amount=values.pop("amount", -50_000),
        currency="KRW",
        **values,
    )


@pytest.mark.parametrize(
    ("first", "posted", "number", "due"),
    [
        (date(2031, 5, 30), date(2031, 6, 1), 1, date(2031, 5, 30)),
        (date(2031, 5, 30), date(2031, 8, 1), 3, date(2031, 7, 30)),
        (date(2031, 1, 31), date(2031, 3, 1), 2, date(2031, 2, 28)),
        (date(2032, 1, 31), date(2032, 3, 1), 2, date(2032, 2, 29)),
        (date(2031, 6, 1), date(2031, 5, 30), 1, date(2031, 6, 1)),
    ],
)
def test_nearest_due_agrees_for_forecast_and_suggestion(first, posted, number, due):
    registered = plan(first)
    row = transaction(posted)
    assert _plan_matches(
        {
            "date": row.date,
            "amount": row.amount,
            "merchant": row.merchant,
            "payment_method": row.payment_method,
        },
        registered,
    )
    suggestion = _match_transaction_to_plan(
        transaction=row,
        plan=registered,
        occupied_numbers={},
        linked_evidence=[],
        alias_rules=[],
    )
    assert suggestion is not None
    assert suggestion.installment_number == number
    assert suggestion.expected_billing_date == due


@pytest.mark.parametrize("day_delta", [0, 3, 4, 7, 8])
def test_forecast_date_window_is_shared_without_high_confidence_for_wide_dates(
    day_delta,
):
    registered = plan(date(2031, 5, 10))
    row = transaction(date(2031, 6, 10 + day_delta))
    forecast_match = _plan_matches(
        {
            "date": row.date,
            "amount": row.amount,
            "merchant": row.merchant,
            "payment_method": row.payment_method,
        },
        registered,
    )
    suggestion = _match_transaction_to_plan(
        transaction=row,
        plan=registered,
        occupied_numbers={},
        linked_evidence=[],
        alias_rules=[],
    )
    assert forecast_match == (suggestion is not None) == (day_delta <= 7)
    if suggestion is not None and day_delta > 3:
        assert suggestion.confidence == "medium"
        assert suggestion.score < 90


def test_forecast_exact_amount_is_a_subset_and_rejects_other_methods():
    registered = plan()
    for amount, method in [(-49_000, "Example Card"), (-50_000, "Other Card")]:
        match = match_installment_plan(
            plan=registered,
            transaction_date=date(2031, 6, 1),
            amount=amount,
            merchant=registered.merchant,
            payment_method=method,
        )
        assert match is None
    suggestion = _match_transaction_to_plan(
        transaction=transaction(date(2031, 6, 1), amount=-49_000),
        plan=registered,
        occupied_numbers={},
        linked_evidence=[],
        alias_rules=[],
    )
    assert suggestion is not None


@pytest.mark.parametrize(
    ("first", "posted", "number", "expected"),
    [
        (date(2031, 5, 30), date(2031, 6, 1), 1, date(2031, 5, 30)),
        (date(2031, 5, 30), date(2031, 8, 1), 3, date(2031, 7, 30)),
        (date(2031, 6, 1), date(2031, 5, 30), 1, date(2031, 6, 1)),
    ],
)
async def test_cross_month_unconfirmed_forecast_row_is_a_read_only_correct_number_suggestion(
    db_session, first, posted, number, expected
):
    registered = plan(first)
    row = transaction(posted)
    db_session.add_all([registered, row])
    await db_session.commit()

    suggestions = await list_installment_transaction_suggestions(
        db_session, installment_plan_id=registered.id, page=1, per_page=40
    )
    assert suggestions.total == 1
    assert suggestions.items[0].suggested_installment_number == number
    assert suggestions.items[0].expected_billing_date == expected
    projection = await get_monthly_projection(db_session, reference_date=posted)
    installment = next(
        item for item in projection.expense_components if item.kind == "installment"
    )
    assert installment.link_unconfirmed_count == suggestions.total
    assert installment.known_expected_remaining == 0
    assert (
        await db_session.scalar(
            select(func.count()).select_from(InstallmentTransactionLink)
        )
        == 0
    )


@pytest.mark.parametrize("reference", [date(2031, 4, 30), date(2031, 8, 1)])
async def test_no_boundary_payment_does_not_extend_the_forecast_schedule(
    db_session, reference
):
    db_session.add(plan())
    await db_session.commit()
    projection = await get_monthly_projection(db_session, reference_date=reference)
    installment = next(
        item for item in projection.expense_components if item.kind == "installment"
    )
    assert installment.link_unconfirmed_count == 0
    assert installment.known_expected_remaining == 0
    assert installment.missing_reasons == []


async def test_two_different_occurrences_posted_in_one_month_are_unconfirmed_individually(
    db_session,
):
    registered = plan(date(2031, 5, 30))
    first = transaction(date(2031, 6, 1))
    second = transaction(date(2031, 6, 30))
    second.id = 2
    db_session.add_all([registered, first, second])
    await db_session.commit()
    suggestions = await list_installment_transaction_suggestions(
        db_session, installment_plan_id=registered.id, page=1, per_page=40
    )
    assert [item.suggested_installment_number for item in suggestions.items] == [1, 2]
    projection = await get_monthly_projection(
        db_session, reference_date=date(2031, 6, 30)
    )
    installment = next(
        item for item in projection.expense_components if item.kind == "installment"
    )
    assert installment.link_unconfirmed_count == 2
    assert installment.known_expected_remaining == 0
    assert (
        await db_session.scalar(
            select(func.count()).select_from(InstallmentTransactionLink)
        )
        == 0
    )
