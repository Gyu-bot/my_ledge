"""add advisor canonical read model views

Revision ID: 20260528_0015
Revises: 20260526_0014
Create Date: 2026-05-28 19:20:00
"""

from collections.abc import Sequence

from alembic import op


revision: str = "20260528_0015"
down_revision: str | None = "20260526_0014"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    _drop_advisor_views()
    op.execute("DROP VIEW IF EXISTS vw_fixed_cost_monthly_summary")
    _create_fixed_cost_monthly_summary_view(exclude_loan_repayments=True)
    _create_monthly_cashflow_view()
    _create_loan_repayment_monthly_view()
    _create_true_spendable_monthly_view()
    _create_merchant_monthly_baseline_view()
    _create_unclassified_work_queue_view()


def downgrade() -> None:
    _drop_advisor_views()
    op.execute("DROP VIEW IF EXISTS vw_fixed_cost_monthly_summary")
    _create_fixed_cost_monthly_summary_view(exclude_loan_repayments=False)


def _drop_advisor_views() -> None:
    op.execute("DROP VIEW IF EXISTS vw_unclassified_work_queue")
    op.execute("DROP VIEW IF EXISTS vw_merchant_monthly_baseline")
    op.execute("DROP VIEW IF EXISTS vw_true_spendable_monthly")
    op.execute("DROP VIEW IF EXISTS vw_loan_repayment_monthly")
    op.execute("DROP VIEW IF EXISTS vw_monthly_cashflow")


def _create_fixed_cost_monthly_summary_view(*, exclude_loan_repayments: bool) -> None:
    source_relation = (
        "vw_transactions_effective" if exclude_loan_repayments else "transactions"
    )
    loan_filter = "AND t.loan_account_id IS NULL" if exclude_loan_repayments else ""
    deleted_filter = (
        ""
        if exclude_loan_repayments
        else """
          AND t.is_deleted = FALSE
          AND t.merged_into_id IS NULL
        """
    )
    op.execute(
        f"""
        CREATE VIEW vw_fixed_cost_monthly_summary AS
        SELECT
            to_char(t.date, 'YYYY-MM') AS period,
            COALESCE(SUM(-t.amount), 0)::integer AS expense_total,
            COALESCE(SUM(CASE WHEN t.cost_kind = 'fixed' THEN -t.amount ELSE 0 END), 0)::integer AS fixed_total,
            COALESCE(SUM(CASE WHEN t.cost_kind = 'variable' THEN -t.amount ELSE 0 END), 0)::integer AS variable_total,
            COALESCE(SUM(CASE WHEN t.cost_kind = 'fixed' AND t.fixed_cost_necessity = 'essential' THEN -t.amount ELSE 0 END), 0)::integer AS essential_fixed_total,
            COALESCE(SUM(CASE WHEN t.cost_kind = 'fixed' AND t.fixed_cost_necessity = 'discretionary' THEN -t.amount ELSE 0 END), 0)::integer AS discretionary_fixed_total,
            COALESCE(SUM(CASE WHEN t.cost_kind IS NULL THEN -t.amount ELSE 0 END), 0)::integer AS unclassified_total,
            COUNT(CASE WHEN t.cost_kind IS NULL THEN 1 END)::integer AS unclassified_count
        FROM {source_relation} t
        WHERE t.type = '지출'
          {loan_filter}
          {deleted_filter}
        GROUP BY to_char(t.date, 'YYYY-MM')
        """
    )


def _create_monthly_cashflow_view() -> None:
    op.execute(
        """
        CREATE VIEW vw_monthly_cashflow AS
        WITH monthly AS (
            SELECT
                to_char(t.date, 'YYYY-MM') AS period,
                COALESCE(SUM(CASE WHEN t.type = '수입' THEN t.amount ELSE 0 END), 0)::integer AS income_total,
                COALESCE(SUM(CASE WHEN t.type = '지출' THEN -t.amount ELSE 0 END), 0)::integer AS expense_total,
                COALESCE(SUM(CASE WHEN t.type = '지출' AND t.loan_account_id IS NULL THEN -t.amount ELSE 0 END), 0)::integer AS non_loan_expense_total,
                COALESCE(SUM(CASE WHEN t.type = '이체' THEN ABS(t.amount) ELSE 0 END), 0)::integer AS transfer_activity_total,
                COALESCE(SUM(CASE WHEN t.type = '지출' AND t.loan_account_id IS NOT NULL THEN -t.amount ELSE 0 END), 0)::integer AS loan_repayment_total,
                COALESCE(SUM(CASE WHEN t.type = '지출' AND t.loan_account_id IS NULL AND t.cost_kind = 'fixed' THEN -t.amount ELSE 0 END), 0)::integer AS fixed_total,
                COALESCE(SUM(CASE WHEN t.type = '지출' AND t.loan_account_id IS NULL AND t.cost_kind = 'variable' THEN -t.amount ELSE 0 END), 0)::integer AS variable_total,
                COALESCE(SUM(CASE WHEN t.type = '지출' AND t.loan_account_id IS NULL AND t.cost_kind = 'fixed' AND t.fixed_cost_necessity = 'essential' THEN -t.amount ELSE 0 END), 0)::integer AS essential_fixed_total,
                COALESCE(SUM(CASE WHEN t.type = '지출' AND t.loan_account_id IS NULL AND t.cost_kind = 'fixed' AND t.fixed_cost_necessity = 'discretionary' THEN -t.amount ELSE 0 END), 0)::integer AS discretionary_fixed_total,
                COALESCE(SUM(CASE WHEN t.type = '지출' AND t.loan_account_id IS NULL AND t.cost_kind IS NULL THEN -t.amount ELSE 0 END), 0)::integer AS unclassified_expense_total
            FROM vw_transactions_effective t
            GROUP BY to_char(t.date, 'YYYY-MM')
        )
        SELECT
            period,
            income_total,
            expense_total,
            non_loan_expense_total,
            transfer_activity_total,
            loan_repayment_total,
            fixed_total,
            variable_total,
            essential_fixed_total,
            discretionary_fixed_total,
            unclassified_expense_total,
            (income_total - expense_total)::integer AS net_cashflow,
            CASE
                WHEN income_total = 0 THEN NULL
                ELSE ROUND((income_total - expense_total)::numeric / income_total, 4)
            END AS savings_rate
        FROM monthly
        """
    )


def _create_loan_repayment_monthly_view() -> None:
    op.execute(
        """
        CREATE VIEW vw_loan_repayment_monthly AS
        SELECT
            to_char(t.date, 'YYYY-MM') AS period,
            t.loan_account_id,
            t.loan_display_name,
            t.loan_lender,
            t.loan_product_name,
            t.loan_kind,
            t.loan_maturity_date,
            t.loan_repayment_type,
            COALESCE(SUM(-t.amount), 0)::integer AS repayment_total,
            COUNT(*)::integer AS transaction_count
        FROM vw_transactions_effective t
        WHERE t.type = '지출'
          AND t.loan_account_id IS NOT NULL
        GROUP BY
            to_char(t.date, 'YYYY-MM'),
            t.loan_account_id,
            t.loan_display_name,
            t.loan_lender,
            t.loan_product_name,
            t.loan_kind,
            t.loan_maturity_date,
            t.loan_repayment_type
        """
    )


def _create_true_spendable_monthly_view() -> None:
    op.execute(
        """
        CREATE VIEW vw_true_spendable_monthly AS
        SELECT
            period,
            income_total,
            loan_repayment_total,
            fixed_total AS fixed_commitment_total,
            variable_total,
            (income_total - loan_repayment_total - fixed_total)::integer AS spendable_before_variable_spend,
            (income_total - loan_repayment_total - fixed_total - variable_total)::integer AS remaining_after_variable_spend
        FROM vw_monthly_cashflow
        """
    )


def _create_merchant_monthly_baseline_view() -> None:
    op.execute(
        """
        CREATE VIEW vw_merchant_monthly_baseline AS
        WITH monthly AS (
            SELECT
                date_trunc('month', t.date)::date AS period_month,
                to_char(t.date, 'YYYY-MM') AS period,
                t.merchant,
                t.effective_category_major,
                t.effective_category_minor,
                COALESCE(SUM(-t.amount), 0)::integer AS monthly_spend,
                COUNT(*)::integer AS transaction_count
            FROM vw_transactions_effective t
            WHERE t.type = '지출'
              AND t.loan_account_id IS NULL
            GROUP BY
                date_trunc('month', t.date)::date,
                to_char(t.date, 'YYYY-MM'),
                t.merchant,
                t.effective_category_major,
                t.effective_category_minor
        ),
        with_baseline AS (
            SELECT
                monthly.*,
                COUNT(*) OVER baseline_window AS baseline_month_count,
                ROUND(AVG(monthly_spend) OVER baseline_window, 2) AS trailing_3_month_avg
            FROM monthly
            WINDOW baseline_window AS (
                PARTITION BY merchant, effective_category_major, effective_category_minor
                ORDER BY period_month
                ROWS BETWEEN 3 PRECEDING AND 1 PRECEDING
            )
        )
        SELECT
            period,
            merchant,
            effective_category_major,
            effective_category_minor,
            monthly_spend,
            transaction_count,
            baseline_month_count::integer AS baseline_month_count,
            trailing_3_month_avg,
            CASE
                WHEN trailing_3_month_avg IS NULL THEN NULL
                ELSE ROUND(monthly_spend - trailing_3_month_avg, 2)
            END AS baseline_delta,
            CASE
                WHEN trailing_3_month_avg IS NULL OR trailing_3_month_avg = 0 THEN NULL
                ELSE ROUND((monthly_spend - trailing_3_month_avg) / trailing_3_month_avg, 4)
            END AS baseline_delta_pct
        FROM with_baseline
        """
    )


def _create_unclassified_work_queue_view() -> None:
    op.execute(
        """
        CREATE VIEW vw_unclassified_work_queue AS
        WITH expense_rows AS (
            SELECT
                t.*,
                ABS(t.amount)::integer AS amount_abs,
                COUNT(*) OVER (PARTITION BY t.merchant)::integer AS merchant_expense_count
            FROM vw_transactions_effective t
            WHERE t.type = '지출'
              AND t.loan_account_id IS NULL
        ),
        classified AS (
            SELECT
                transaction_rows.*,
                (transaction_rows.cost_kind IS NULL) AS needs_cost_kind,
                (
                    transaction_rows.cost_kind = 'fixed'
                    AND transaction_rows.fixed_cost_necessity IS NULL
                ) AS needs_fixed_cost_necessity,
                (
                    transaction_rows.recurring_payment_kind IS NULL
                    AND (
                        transaction_rows.cost_kind = 'fixed'
                        OR transaction_rows.merchant_expense_count >= 2
                    )
                ) AS needs_recurring_payment_kind,
                (
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
                ) AS needs_loan_link_review
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
