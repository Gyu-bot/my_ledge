"""Shared, read-only checks against a person-registered installment plan."""

from dataclasses import dataclass
from datetime import date

from app.models.installment_plan import InstallmentPlan
from app.services.installment_service import _add_months

BILLING_DATE_TOLERANCE_DAYS = 7


def normalized_plan_merchant(value: str) -> str:
    return " ".join(value.lower().split())


def nearest_installment_number(
    *, first_payment_date: date, transaction_date: date, total_installments: int
) -> int:
    """Choose the nearest scheduled date, including either adjacent month.

    Bounds select valid occurrences; the caller still checks the date distance
    so a transaction outside the plan cannot match a distant endpoint.
    """
    calendar_number = (
        (transaction_date.year - first_payment_date.year) * 12
        + transaction_date.month
        - first_payment_date.month
        + 1
    )
    candidates = {
        max(1, min(number, total_installments))
        for number in (calendar_number - 1, calendar_number, calendar_number + 1)
    }
    return min(
        candidates,
        key=lambda number: (
            abs((transaction_date - _add_months(first_payment_date, number - 1)).days),
            number,
        ),
    )


@dataclass(frozen=True)
class InstallmentPlanMatch:
    installment_number: int
    expected_billing_date: date
    amount_delta: int
    billing_day_delta: int


def match_installment_plan(
    *,
    plan: InstallmentPlan,
    transaction_date: date,
    amount: int,
    merchant: str,
    payment_method: str | None,
    amount_tolerance: int = 0,
    confirmed_merchant_continuity: bool = False,
) -> InstallmentPlanMatch | None:
    """Match a schedule, without linking a transaction or inferring a plan.

    Suggestions may additionally use confirmed alias/description evidence and
    an amount tolerance. Forecasts use the exact-amount subset.
    """
    if plan.total_installments < 1:
        return None
    if plan.payment_method and payment_method != plan.payment_method:
        return None
    if (
        normalized_plan_merchant(merchant) != normalized_plan_merchant(plan.merchant)
        and not confirmed_merchant_continuity
    ):
        return None
    number = nearest_installment_number(
        first_payment_date=plan.first_payment_date,
        transaction_date=transaction_date,
        total_installments=plan.total_installments,
    )
    expected = _add_months(plan.first_payment_date, number - 1)
    amount_delta = abs(abs(amount) - plan.monthly_amount)
    day_delta = abs((transaction_date - expected).days)
    if amount_delta > amount_tolerance or day_delta > BILLING_DATE_TOLERANCE_DAYS:
        return None
    return InstallmentPlanMatch(number, expected, amount_delta, day_delta)
