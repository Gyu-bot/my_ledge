"""tighten unclassified queue recurring signal

Revision ID: 20260528_0017
Revises: 20260528_0016
Create Date: 2026-05-28 23:35:00.000000
"""

from collections.abc import Sequence

from alembic import op

revision: str = "20260528_0017"
down_revision: str | None = "20260528_0016"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _create_unclassified_work_queue_view(*, require_monthly_signal: bool) -> None:
    needs_cost_kind = "COALESCE(transaction_rows.cost_kind IS NULL, FALSE)"
    needs_fixed_cost_necessity = """
                COALESCE((
                    transaction_rows.cost_kind = 'fixed'
                    AND transaction_rows.fixed_cost_necessity IS NULL
                ), FALSE)
    """
    if require_monthly_signal:
        needs_recurring_payment_kind = """
                COALESCE((
                    transaction_rows.recurring_payment_kind IS NULL
                    AND (
                        transaction_rows.cost_kind = 'fixed'
                        OR (
                            transaction_rows.merchant_active_month_count >= 2
                            AND transaction_rows.merchant_active_date_count >= 2
                            AND transaction_rows.merchant_amount_cv <= 0.5
                        )
                    )
                ), FALSE)
        """
    else:
        needs_recurring_payment_kind = """
                COALESCE((
                    transaction_rows.recurring_payment_kind IS NULL
                    AND (
                        transaction_rows.cost_kind = 'fixed'
                        OR transaction_rows.merchant_expense_count >= 2
                    )
                ), FALSE)
        """
    needs_loan_link_review = """
                COALESCE((
                    transaction_rows.effective_category_major = '금융'
                    OR COALESCE(transaction_rows.effective_category_minor, '') ILIKE '%대출%'
                    OR COALESCE(transaction_rows.effective_category_minor, '') ILIKE '%상환%'
                    OR COALESCE(transaction_rows.effective_category_minor, '') ILIKE '%이자%'
                    OR transaction_rows.description ILIKE '%대출%'
                    OR transaction_rows.description ILIKE '%상환%'
                    OR transaction_rows.description ILIKE '%이자%'
                    OR transaction_rows.description ILIKE '%원리금%'
                    OR transaction_rows.description ILIKE '%원금·이자%'
                    OR transaction_rows.description ILIKE '%원금 이자%'
                    OR transaction_rows.merchant ILIKE '%대출%'
                    OR transaction_rows.merchant ILIKE '%상환%'
                    OR transaction_rows.merchant ILIKE '%이자%'
                    OR COALESCE(transaction_rows.payment_method, '') ILIKE '%대출%'
                    OR COALESCE(transaction_rows.payment_method, '') ILIKE '%상환%'
                    OR COALESCE(transaction_rows.payment_method, '') ILIKE '%이자%'
                ), FALSE)
    """

    op.execute(
        f"""
        CREATE OR REPLACE VIEW vw_unclassified_work_queue AS
        WITH expense_base AS (
            SELECT
                t.*,
                ABS(t.amount)::integer AS amount_abs
            FROM vw_transactions_effective t
            WHERE t.type = '지출'
              AND t.loan_account_id IS NULL
        ),
        merchant_stats AS (
            SELECT
                merchant,
                COUNT(*)::integer AS merchant_expense_count,
                COUNT(DISTINCT date)::integer AS merchant_active_date_count,
                COUNT(DISTINCT DATE_TRUNC('month', date)::date)::integer
                    AS merchant_active_month_count,
                COALESCE(AVG(amount_abs), 0)::numeric AS merchant_amount_avg,
                COALESCE(STDDEV_POP(amount_abs), 0)::numeric AS merchant_amount_stddev
            FROM expense_base
            GROUP BY merchant
        ),
        expense_rows AS (
            SELECT
                expense_base.*,
                merchant_stats.merchant_expense_count,
                merchant_stats.merchant_active_date_count,
                merchant_stats.merchant_active_month_count,
                CASE
                    WHEN merchant_stats.merchant_amount_avg > 0
                    THEN (
                        merchant_stats.merchant_amount_stddev
                        / merchant_stats.merchant_amount_avg
                    )
                    ELSE NULL
                END AS merchant_amount_cv
            FROM expense_base
            JOIN merchant_stats USING (merchant)
        ),
        classified AS (
            SELECT
                transaction_rows.*,
                {needs_cost_kind} AS needs_cost_kind,
                {needs_fixed_cost_necessity} AS needs_fixed_cost_necessity,
                {needs_recurring_payment_kind} AS needs_recurring_payment_kind,
                {needs_loan_link_review} AS needs_loan_link_review
            FROM expense_rows transaction_rows
        )
        SELECT
            id AS transaction_id,
            date,
            type,
            merchant,
            effective_category_major,
            effective_category_minor,
            amount,
            amount_abs,
            needs_cost_kind,
            needs_fixed_cost_necessity,
            needs_recurring_payment_kind,
            needs_loan_link_review,
            merchant_expense_count,
            (
                LEAST(amount_abs, 1000000)
                + CASE WHEN needs_loan_link_review THEN 50000 ELSE 0 END
                + CASE WHEN needs_cost_kind THEN 30000 ELSE 0 END
                + CASE WHEN needs_fixed_cost_necessity THEN 20000 ELSE 0 END
                + CASE WHEN needs_recurring_payment_kind THEN 10000 ELSE 0 END
                + CASE WHEN merchant_expense_count >= 2 THEN 5000 ELSE 0 END
            )::integer AS priority_score,
            CASE
                WHEN needs_loan_link_review THEN 'loan_link_review'
                WHEN needs_cost_kind THEN 'missing_cost_kind'
                WHEN needs_fixed_cost_necessity THEN 'missing_fixed_necessity'
                WHEN needs_recurring_payment_kind THEN 'missing_recurring_kind'
                ELSE 'review'
            END AS priority_reason
        FROM classified
        WHERE needs_cost_kind
           OR needs_fixed_cost_necessity
           OR needs_recurring_payment_kind
           OR needs_loan_link_review
        """
    )


def upgrade() -> None:
    _create_unclassified_work_queue_view(require_monthly_signal=True)


def downgrade() -> None:
    _create_unclassified_work_queue_view(require_monthly_signal=False)
