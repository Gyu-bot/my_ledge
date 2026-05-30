from datetime import date
from statistics import median
from typing import Any, TypeVar

from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.engine import RowMapping
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.canonical_views import (
    CanonicalLoanRepaymentMonthlyItem,
    CanonicalMerchantMonthlyBaselineItem,
    CanonicalMonthlyCashflowItem,
    CanonicalRecurringMerchantMonthlyItem,
    CanonicalTrueSpendableMonthlyItem,
    CanonicalUnclassifiedWorkQueueItem,
    CanonicalViewsDashboardResponse,
)

T = TypeVar("T", bound=BaseModel)
INCOME_ESTIMATE_LOOKBACK_MONTHS = 6
INCOME_ESTIMATE_MIN_ADJUSTED_MONTHS = 3
INCOME_OUTLIER_RATIO = 0.3
INCOME_ESTIMATE_THRESHOLD_RATIO = 0.5


def _to_items(rows: list[RowMapping], model: type[T]) -> list[T]:
    return [model.model_validate(dict(row)) for row in rows]


async def _fetch_rows(
    db_session: AsyncSession,
    sql: str,
    params: dict[str, Any],
) -> list[RowMapping]:
    result = await db_session.execute(text(sql), params)
    return list(result.mappings())


def _reference_period(reference_date: date) -> str:
    return reference_date.strftime("%Y-%m")


def _estimate_income_from_closed_months(
    monthly_cashflow: list[CanonicalMonthlyCashflowItem],
    *,
    current_period: str,
) -> tuple[int | None, int, str | None, list[str]]:
    closed_months = [item for item in monthly_cashflow if item.period < current_period]
    recent_months = closed_months[-INCOME_ESTIMATE_LOOKBACK_MONTHS:]
    if len(recent_months) < INCOME_ESTIMATE_MIN_ADJUSTED_MONTHS:
        return None, len(recent_months), None, []

    income_median = median(item.income_total for item in recent_months)
    lower_bound = income_median * (1 - INCOME_OUTLIER_RATIO)
    upper_bound = income_median * (1 + INCOME_OUTLIER_RATIO)
    adjusted_months = [
        item for item in recent_months if lower_bound <= item.income_total <= upper_bound
    ]
    excluded_periods = [
        item.period for item in recent_months if item not in adjusted_months
    ]

    if len(adjusted_months) >= INCOME_ESTIMATE_MIN_ADJUSTED_MONTHS:
        estimated_income = round(
            sum(item.income_total for item in adjusted_months) / len(adjusted_months)
        )
        source = (
            "trailing_6_outlier_adjusted_avg"
            if excluded_periods
            else "trailing_6_closed_month_avg"
        )
        return estimated_income, len(adjusted_months), source, excluded_periods

    return (
        round(income_median),
        len(recent_months),
        "trailing_6_income_median",
        excluded_periods,
    )


def _enrich_true_spendable_items(
    true_spendable: list[CanonicalTrueSpendableMonthlyItem],
    *,
    monthly_cashflow: list[CanonicalMonthlyCashflowItem],
    reference_date: date,
) -> list[CanonicalTrueSpendableMonthlyItem]:
    current_period = _reference_period(reference_date)
    (
        estimated_income,
        estimate_month_count,
        estimate_source,
        excluded_income_periods,
    ) = _estimate_income_from_closed_months(
        monthly_cashflow,
        current_period=current_period,
    )
    enriched: list[CanonicalTrueSpendableMonthlyItem] = []
    for item in true_spendable:
        observed_income = item.income_total
        update: dict[str, Any] = {
            "observed_income_total": observed_income,
        }
        if (
            item.period == current_period
            and estimated_income is not None
            and observed_income < estimated_income * INCOME_ESTIMATE_THRESHOLD_RATIO
        ):
            update.update(
                {
                    "income_basis": "estimated",
                    "is_income_estimated": True,
                    "estimated_income_total": estimated_income,
                    "income_estimate_month_count": estimate_month_count,
                    "income_estimate_source": estimate_source,
                    "excluded_income_periods": excluded_income_periods,
                    "estimated_spendable_before_variable_spend": (
                        estimated_income
                        - item.loan_repayment_total
                        - item.fixed_commitment_total
                    ),
                    "estimated_remaining_after_variable_spend": (
                        estimated_income
                        - item.loan_repayment_total
                        - item.fixed_commitment_total
                        - item.variable_total
                    ),
                }
            )
        enriched.append(item.model_copy(update=update))
    return enriched


async def get_canonical_views_dashboard(
    db_session: AsyncSession,
    *,
    months: int = 12,
    merchant_limit: int = 10,
    queue_limit: int = 10,
    reference_date: date | None = None,
) -> CanonicalViewsDashboardResponse:
    monthly_cashflow = await _fetch_rows(
        db_session,
        """
        SELECT *
        FROM (
            SELECT *
            FROM vw_monthly_cashflow
            ORDER BY period DESC
            LIMIT :months
        ) recent_months
        ORDER BY period ASC
        """,
        {"months": months},
    )
    true_spendable = await _fetch_rows(
        db_session,
        """
        SELECT *
        FROM (
            SELECT *
            FROM vw_true_spendable_monthly
            ORDER BY period DESC
            LIMIT :months
        ) recent_months
        ORDER BY period ASC
        """,
        {"months": months},
    )
    loan_repayments = await _fetch_rows(
        db_session,
        """
        SELECT *
        FROM vw_loan_repayment_monthly
        ORDER BY period DESC, repayment_total DESC, loan_account_id ASC
        LIMIT :limit
        """,
        {"limit": max(months * 8, 1)},
    )
    merchant_baselines = await _fetch_rows(
        db_session,
        """
        SELECT *
        FROM vw_merchant_monthly_baseline
        ORDER BY period DESC, COALESCE(ABS(baseline_delta), 0) DESC, monthly_spend DESC
        LIMIT :limit
        """,
        {"limit": merchant_limit},
    )
    recurring_merchants = await _fetch_rows(
        db_session,
        """
        SELECT *
        FROM vw_recurring_merchant_monthly
        ORDER BY period DESC, monthly_spend DESC, merchant ASC
        LIMIT :limit
        """,
        {"limit": merchant_limit},
    )
    unclassified_queue = await _fetch_rows(
        db_session,
        """
        SELECT
            transaction_id,
            date,
            type,
            merchant,
            effective_category_major,
            effective_category_minor,
            amount,
            amount_abs,
            COALESCE(needs_cost_kind, false) AS needs_cost_kind,
            COALESCE(needs_fixed_cost_necessity, false) AS needs_fixed_cost_necessity,
            COALESCE(needs_spend_necessity, false) AS needs_spend_necessity,
            COALESCE(needs_recurring_payment_kind, false) AS needs_recurring_payment_kind,
            COALESCE(needs_loan_link_review, false) AS needs_loan_link_review,
            merchant_expense_count,
            priority_score,
            priority_reason
        FROM vw_unclassified_work_queue
        ORDER BY priority_score DESC, date DESC, transaction_id ASC
        LIMIT :limit
        """,
        {"limit": queue_limit},
    )

    monthly_cashflow_items = _to_items(monthly_cashflow, CanonicalMonthlyCashflowItem)
    true_spendable_items = _to_items(
        true_spendable,
        CanonicalTrueSpendableMonthlyItem,
    )

    return CanonicalViewsDashboardResponse(
        monthly_cashflow=monthly_cashflow_items,
        true_spendable_monthly=_enrich_true_spendable_items(
            true_spendable_items,
            monthly_cashflow=monthly_cashflow_items,
            reference_date=reference_date or date.today(),
        ),
        loan_repayment_monthly=_to_items(
            loan_repayments,
            CanonicalLoanRepaymentMonthlyItem,
        ),
        merchant_monthly_baseline=_to_items(
            merchant_baselines,
            CanonicalMerchantMonthlyBaselineItem,
        ),
        recurring_merchant_monthly=_to_items(
            recurring_merchants,
            CanonicalRecurringMerchantMonthlyItem,
        ),
        unclassified_work_queue=_to_items(
            unclassified_queue,
            CanonicalUnclassifiedWorkQueueItem,
        ),
    )
