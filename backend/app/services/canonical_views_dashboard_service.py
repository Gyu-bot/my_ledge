import calendar
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
    CanonicalDataCoverage,
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


async def _load_data_coverage(db_session: AsyncSession) -> CanonicalDataCoverage:
    rows = await _fetch_rows(
        db_session,
        """
        SELECT
            MIN(date) AS first_transaction_date,
            MAX(date) AS last_transaction_date
        FROM transactions
        WHERE is_deleted = false
          AND merged_into_id IS NULL
        """,
        {},
    )
    row = rows[0] if rows else {}
    return CanonicalDataCoverage(
        first_transaction_date=row.get("first_transaction_date"),
        last_transaction_date=row.get("last_transaction_date"),
    )


def _is_complete_month(period: str, coverage: CanonicalDataCoverage) -> bool:
    if (
        coverage.first_transaction_date is None
        or coverage.last_transaction_date is None
    ):
        return False
    year, month = (int(part) for part in period.split("-", 1))
    month_start = date(year, month, 1)
    month_end = date(year, month, calendar.monthrange(year, month)[1])
    return (
        coverage.first_transaction_date <= month_start
        and coverage.last_transaction_date >= month_end
    )


def _apply_complete_month_flags(
    items: list[T],
    coverage: CanonicalDataCoverage,
) -> list[T]:
    return [
        item.model_copy(
            update={"is_complete_month": _is_complete_month(item.period, coverage)}
        )
        for item in items
    ]


def _apply_cashflow_basis(
    items: list[CanonicalMonthlyCashflowItem],
) -> list[CanonicalMonthlyCashflowItem]:
    enriched: list[CanonicalMonthlyCashflowItem] = []
    for item in items:
        if item.income_total <= 0 or item.savings_rate is None:
            basis = "no_income"
        elif item.is_complete_month:
            basis = "observed_closed_month"
        else:
            estimated_income, _, _, _ = _estimate_income_from_closed_months(
                items,
                current_period=item.period,
            )
            if (
                estimated_income is not None
                and item.income_total < estimated_income * INCOME_ESTIMATE_THRESHOLD_RATIO
            ):
                basis = "insufficient_partial_month_income"
            else:
                basis = "observed_partial_month"
        enriched.append(item.model_copy(update={"savings_rate_basis": basis}))
    return enriched


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
        item
        for item in recent_months
        if lower_bound <= item.income_total <= upper_bound
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


def _queue_issue_types(item: CanonicalUnclassifiedWorkQueueItem) -> list[str]:
    issues: list[str] = []
    if item.needs_cost_kind:
        issues.append("cost_kind")
    if item.needs_fixed_cost_necessity or item.needs_spend_necessity:
        issues.append("spend_necessity")
    if item.needs_recurring_payment_kind:
        issues.append("recurring_kind")
    if item.needs_loan_link_review:
        issues.append("loan_link")
    return issues


def _primary_issue_type(item: CanonicalUnclassifiedWorkQueueItem) -> str | None:
    if item.needs_loan_link_review:
        return "loan_link"
    issues = _queue_issue_types(item)
    return issues[0] if issues else None


def _enrich_unclassified_queue_items(
    items: list[CanonicalUnclassifiedWorkQueueItem],
) -> list[CanonicalUnclassifiedWorkQueueItem]:
    enriched: list[CanonicalUnclassifiedWorkQueueItem] = []
    for item in items:
        issue_types = _queue_issue_types(item)
        enriched.append(
            item.model_copy(
                update={
                    "issue_types": issue_types,
                    "primary_issue_type": _primary_issue_type(item),
                    "recurrence_signal": {
                        "has_monthly_pattern": item.needs_recurring_payment_kind,
                        "active_month_count": item.merchant_expense_count
                        if item.needs_recurring_payment_kind
                        else 0,
                        "same_month_repeat_only": False,
                    },
                }
            )
        )
    return enriched


def _filter_unclassified_queue_items(
    items: list[CanonicalUnclassifiedWorkQueueItem],
    *,
    issue_types: str | None,
    period_from: str | None,
    period_to: str | None,
    current_only: bool,
    reference_date: date,
) -> list[CanonicalUnclassifiedWorkQueueItem]:
    requested_issues = {
        item.strip()
        for item in (issue_types or "").split(",")
        if item.strip()
    }
    current_period = _reference_period(reference_date)
    filtered = items
    if requested_issues:
        filtered = [
            item
            for item in filtered
            if requested_issues.intersection(item.issue_types)
        ]
    if current_only:
        filtered = [
            item for item in filtered if _reference_period(item.date) == current_period
        ]
    if period_from is not None:
        filtered = [
            item for item in filtered if _reference_period(item.date) >= period_from
        ]
    if period_to is not None:
        filtered = [
            item for item in filtered if _reference_period(item.date) <= period_to
        ]
    return filtered


async def get_canonical_views_dashboard(
    db_session: AsyncSession,
    *,
    months: int = 12,
    merchant_limit: int = 10,
    queue_limit: int = 10,
    issue_types: str | None = None,
    period_from: str | None = None,
    period_to: str | None = None,
    current_only: bool = False,
    reference_date: date | None = None,
) -> CanonicalViewsDashboardResponse:
    resolved_reference_date = reference_date or date.today()
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
    data_coverage = await _load_data_coverage(db_session)
    monthly_cashflow_items = _apply_complete_month_flags(
        monthly_cashflow_items,
        data_coverage,
    )
    monthly_cashflow_items = _apply_cashflow_basis(monthly_cashflow_items)
    true_spendable_items = _to_items(
        true_spendable,
        CanonicalTrueSpendableMonthlyItem,
    )
    true_spendable_items = _apply_complete_month_flags(
        true_spendable_items,
        data_coverage,
    )

    unclassified_queue_items = _enrich_unclassified_queue_items(
        _to_items(
            unclassified_queue,
            CanonicalUnclassifiedWorkQueueItem,
        )
    )
    unclassified_queue_items = _filter_unclassified_queue_items(
        unclassified_queue_items,
        issue_types=issue_types,
        period_from=period_from,
        period_to=period_to,
        current_only=current_only,
        reference_date=resolved_reference_date,
    )

    return CanonicalViewsDashboardResponse(
        data_coverage=data_coverage,
        monthly_cashflow=monthly_cashflow_items,
        true_spendable_monthly=_enrich_true_spendable_items(
            true_spendable_items,
            monthly_cashflow=monthly_cashflow_items,
            reference_date=resolved_reference_date,
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
        unclassified_work_queue=unclassified_queue_items,
    )
