import calendar
from datetime import date
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

from app.services.monthly_projection_service import (
    covered_periods,
    get_monthly_projection,
)

T = TypeVar("T", bound=BaseModel)


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


def _apply_cashflow_basis(
    items: list[CanonicalMonthlyCashflowItem],
) -> list[CanonicalMonthlyCashflowItem]:
    return [
        item.model_copy(
            update={
                "savings_rate_basis": (
                    "no_income"
                    if item.income_total <= 0 or item.savings_rate is None
                    else "observed_closed_month"
                    if item.is_complete_month
                    else "observed_partial_month"
                )
            }
        )
        for item in items
    ]


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


def _queue_sql_filters(
    *,
    issue_types: str | None,
    period_from: str | None,
    period_to: str | None,
    current_only: bool,
    reference_date: date,
    search: str | None,
) -> tuple[str, dict[str, Any]]:
    clauses = ["1 = 1"]
    params: dict[str, Any] = {}
    issue_columns = {
        "cost_kind": "COALESCE(q.needs_cost_kind, false)",
        "spend_necessity": "(COALESCE(q.needs_fixed_cost_necessity, false) OR COALESCE(q.needs_spend_necessity, false))",
        "recurring_kind": "COALESCE(q.needs_recurring_payment_kind, false)",
        "loan_link": "COALESCE(q.needs_loan_link_review, false)",
    }
    issue_columns["recurring_payment_kind"] = issue_columns["recurring_kind"]
    issue_columns["loan_link_review"] = issue_columns["loan_link"]
    requested = {
        item.strip() for item in (issue_types or "").split(",") if item.strip()
    }
    if requested:
        clauses.append(
            "("
            + " OR ".join(
                issue_columns.get(item, "false") for item in sorted(requested)
            )
            + ")"
        )
    if current_only:
        clauses.append("q.date >= :current_start AND q.date <= :current_end")
        params.update(
            current_start=reference_date.replace(day=1),
            current_end=reference_date.replace(
                day=calendar.monthrange(reference_date.year, reference_date.month)[1]
            ),
        )
    if period_from:
        clauses.append("q.date >= :date_from")
        params["date_from"] = date.fromisoformat(period_from + "-01")
    if period_to:
        last = date.fromisoformat(period_to + "-01")
        clauses.append("q.date <= :date_to")
        params["date_to"] = last.replace(
            day=calendar.monthrange(last.year, last.month)[1]
        )
    if search:
        clauses.append(
            "(LOWER(q.merchant) LIKE :search ESCAPE '!' OR LOWER(q.effective_category_major) LIKE :search ESCAPE '!' OR LOWER(COALESCE(q.effective_category_minor, '')) LIKE :search ESCAPE '!')"
        )
        params["search"] = (
            "%"
            + search.casefold().replace("!", "!!").replace("%", "!%").replace("_", "!_")
            + "%"
        )
    return " AND ".join(clauses), params


async def get_canonical_views_dashboard(
    db_session: AsyncSession,
    *,
    months: int = 12,
    merchant_limit: int = 10,
    queue_limit: int = 10,
    queue_page: int = 1,
    search: str | None = None,
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
    queue_where, queue_params = _queue_sql_filters(
        issue_types=issue_types,
        period_from=period_from,
        period_to=period_to,
        current_only=current_only,
        reference_date=resolved_reference_date,
        search=search,
    )
    queue_total_rows = await _fetch_rows(
        db_session,
        f"SELECT COUNT(*) AS total FROM vw_unclassified_work_queue q WHERE {queue_where}",
        queue_params,
    )
    queue_total = int(queue_total_rows[0]["total"])
    unclassified_queue = await _fetch_rows(
        db_session,
        f"""
        SELECT q.transaction_id, q.date, q.type, q.merchant,
            q.effective_category_major, q.effective_category_minor, q.amount, q.amount_abs,
            t.cost_kind, t.fixed_cost_necessity, t.spend_necessity, t.recurring_payment_kind,
            COALESCE(q.needs_cost_kind, false) AS needs_cost_kind,
            COALESCE(q.needs_fixed_cost_necessity, false) AS needs_fixed_cost_necessity,
            COALESCE(q.needs_spend_necessity, false) AS needs_spend_necessity,
            COALESCE(q.needs_recurring_payment_kind, false) AS needs_recurring_payment_kind,
            COALESCE(q.needs_loan_link_review, false) AS needs_loan_link_review,
            q.merchant_expense_count, q.priority_score, q.priority_reason
        FROM vw_unclassified_work_queue q
        LEFT JOIN transactions t ON t.id = q.transaction_id
        WHERE {queue_where}
        ORDER BY q.priority_score DESC, q.date DESC, q.transaction_id ASC
        LIMIT :limit OFFSET :offset
        """,
        {
            **queue_params,
            "limit": queue_limit,
            "offset": (queue_page - 1) * queue_limit,
        },
    )
    summary_counts = await _fetch_rows(
        db_session,
        """SELECT
        (SELECT COUNT(*) FROM vw_merchant_monthly_baseline) AS merchant_total,
        (SELECT COUNT(*) FROM vw_recurring_merchant_monthly) AS recurring_total""",
        {},
    )
    projection = await get_monthly_projection(
        db_session, reference_date=resolved_reference_date
    )

    monthly_cashflow_items = _to_items(monthly_cashflow, CanonicalMonthlyCashflowItem)
    periods = sorted(
        {item.period for item in monthly_cashflow_items}
        | {str(row["period"]) for row in true_spendable}
    )
    sufficiently_covered: list[str] = []
    if periods:
        observed_dates = await _fetch_rows(
            db_session,
            """
            SELECT DISTINCT date FROM transactions
            WHERE is_deleted = false AND merged_into_id IS NULL
              AND date >= :start_date AND date <= :reference_date
        """,
            {
                "start_date": date.fromisoformat(periods[0] + "-01"),
                "reference_date": resolved_reference_date,
            },
        )
        sufficiently_covered, _, _ = covered_periods(
            [
                row["date"]
                if isinstance(row["date"], date)
                else date.fromisoformat(row["date"])
                for row in observed_dates
            ],
            [
                period
                for period in periods
                if period < _reference_period(resolved_reference_date)
            ],
        )
    data_coverage = await _load_data_coverage(db_session)
    monthly_cashflow_items = [
        item.model_copy(
            update={"is_complete_month": item.period in sufficiently_covered}
        )
        for item in monthly_cashflow_items
    ]
    monthly_cashflow_items = _apply_cashflow_basis(monthly_cashflow_items)
    true_spendable_items = _to_items(
        true_spendable,
        CanonicalTrueSpendableMonthlyItem,
    )
    true_spendable_items = [
        item.model_copy(
            update={"is_complete_month": item.period in sufficiently_covered}
        )
        for item in true_spendable_items
    ]

    unclassified_queue_items = _enrich_unclassified_queue_items(
        _to_items(
            unclassified_queue,
            CanonicalUnclassifiedWorkQueueItem,
        )
    )
    return CanonicalViewsDashboardResponse(
        data_coverage=data_coverage,
        month_projection=projection,
        merchant_monthly_baseline_total=int(summary_counts[0]["merchant_total"]),
        recurring_merchant_monthly_total=int(summary_counts[0]["recurring_total"]),
        unclassified_work_queue_total=queue_total,
        unclassified_work_queue_page=queue_page,
        unclassified_work_queue_per_page=queue_limit,
        unclassified_work_queue_total_pages=(queue_total + queue_limit - 1)
        // queue_limit,
        monthly_cashflow=monthly_cashflow_items,
        true_spendable_monthly=true_spendable_items,
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
