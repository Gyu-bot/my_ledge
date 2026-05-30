"""add p1 advisor canonical surfaces

Revision ID: 20260530_0019
Revises: 20260528_0018
Create Date: 2026-05-30 19:30:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "20260530_0019"
down_revision: str | None = "20260528_0018"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("transactions", sa.Column("spend_necessity", sa.String(20)))
    op.add_column("category_classification_rules", sa.Column("spend_necessity", sa.String(20)))
    op.add_column("asset_snapshots", sa.Column("liquidity_tier", sa.String(30)))
    op.add_column("asset_snapshots", sa.Column("is_cash_equivalent", sa.Boolean()))
    op.add_column("loans", sa.Column("monthly_payment", sa.Numeric(15, 2)))
    op.add_column("loans", sa.Column("repayment_method", sa.String(50)))
    op.create_table(
        "merchant_alias_rules",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("alias_pattern", sa.String(500), nullable=False),
        sa.Column("normalized_merchant", sa.String(500), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("alias_pattern", name="uq_merchant_alias_rules_pattern"),
    )
    op.execute(
        """
        UPDATE transactions
        SET spend_necessity = fixed_cost_necessity
        WHERE fixed_cost_necessity IS NOT NULL
        """
    )
    op.execute(
        """
        UPDATE category_classification_rules
        SET spend_necessity = fixed_cost_necessity
        WHERE fixed_cost_necessity IS NOT NULL
        """
    )
    _recreate_views()


def downgrade() -> None:
    _drop_p1_views()
    op.drop_table("merchant_alias_rules")
    op.drop_column("loans", "repayment_method")
    op.drop_column("loans", "monthly_payment")
    op.drop_column("asset_snapshots", "is_cash_equivalent")
    op.drop_column("asset_snapshots", "liquidity_tier")
    op.drop_column("category_classification_rules", "spend_necessity")
    op.drop_column("transactions", "spend_necessity")
    _recreate_legacy_transactions_effective_view()
    _recreate_legacy_advisor_views()


def _drop_p1_views() -> None:
    op.execute("DROP VIEW IF EXISTS vw_recurring_merchant_monthly")
    op.execute("DROP VIEW IF EXISTS vw_unclassified_work_queue")
    op.execute("DROP VIEW IF EXISTS vw_merchant_monthly_baseline")
    op.execute("DROP VIEW IF EXISTS vw_true_spendable_monthly")
    op.execute("DROP VIEW IF EXISTS vw_loan_repayment_monthly")
    op.execute("DROP VIEW IF EXISTS vw_monthly_cashflow")
    op.execute("DROP VIEW IF EXISTS vw_fixed_cost_monthly_summary")
    op.execute("DROP VIEW IF EXISTS vw_transactions_effective")


def _recreate_views() -> None:
    _drop_p1_views()
    _create_transactions_effective_view(include_spend_necessity=True)
    _create_fixed_cost_monthly_summary_view(include_spend_necessity=True)
    _create_monthly_cashflow_view(include_spend_necessity=True)
    _create_loan_repayment_monthly_view()
    _create_true_spendable_monthly_view(include_spend_necessity=True)
    _create_merchant_monthly_baseline_view()
    _create_recurring_merchant_monthly_view()
    _create_unclassified_work_queue_view(include_spend_necessity=True)


def _create_transactions_effective_view(*, include_spend_necessity: bool) -> None:
    spend_column = "t.spend_necessity," if include_spend_necessity else ""
    spend_edited = "OR t.spend_necessity IS NOT NULL" if include_spend_necessity else ""
    op.execute(
        f"""
        CREATE VIEW vw_transactions_effective AS
        WITH latest_loans AS (
            SELECT
                l.lender,
                l.product_name,
                l.start_date AS loan_start_date,
                l.maturity_date AS loan_maturity_date
            FROM loans l
            JOIN (
                SELECT lender, product_name, MAX(snapshot_date) AS latest_snapshot_date
                FROM loans
                GROUP BY lender, product_name
            ) latest
              ON latest.lender = l.lender
             AND latest.product_name = l.product_name
             AND latest.latest_snapshot_date = l.snapshot_date
        )
        SELECT
            t.id,
            t.date,
            t.time,
            t.type,
            t.category_major,
            t.category_minor,
            t.category_major_user,
            t.category_minor_user,
            COALESCE(t.category_major_user, t.category_major) AS effective_category_major,
            COALESCE(t.category_minor_user, t.category_minor) AS effective_category_minor,
            t.description,
            t.merchant,
            t.amount,
            t.currency,
            t.payment_method,
            t.cost_kind,
            t.fixed_cost_necessity,
            {spend_column}
            t.cost_classification_source,
            t.recurring_payment_kind,
            t.memo,
            ltl.loan_account_id,
            la.lender AS loan_lender,
            la.product_name AS loan_product_name,
            COALESCE(la.display_name_user, la.lender || ' ' || la.product_name) AS loan_display_name,
            la.loan_kind AS loan_kind,
            ll.loan_start_date AS loan_start_date,
            ll.loan_maturity_date AS loan_maturity_date,
            ltl.repayment_type AS loan_repayment_type,
            ltl.memo AS loan_link_memo,
            t.is_deleted,
            t.merged_into_id,
            CASE
                WHEN t.category_major_user IS NOT NULL
                  OR t.category_minor_user IS NOT NULL
                  OR t.merchant <> t.description
                  OR t.cost_classification_source = 'manual'
                  {spend_edited}
                  OR t.recurring_payment_kind IS NOT NULL
                  OR t.memo IS NOT NULL
                THEN TRUE
                ELSE FALSE
            END AS is_edited,
            t.source,
            t.created_at,
            t.updated_at
        FROM transactions t
        LEFT JOIN loan_transaction_links ltl ON ltl.transaction_id = t.id
        LEFT JOIN loan_accounts la ON la.id = ltl.loan_account_id
        LEFT JOIN latest_loans ll
          ON ll.lender = la.lender
         AND ll.product_name = la.product_name
        WHERE t.is_deleted = FALSE
          AND t.merged_into_id IS NULL
        """
    )


def _create_fixed_cost_monthly_summary_view(*, include_spend_necessity: bool) -> None:
    essential_variable = (
        "COALESCE(SUM(CASE WHEN t.cost_kind = 'variable' AND t.spend_necessity = 'essential' THEN -t.amount ELSE 0 END), 0)::integer"
        if include_spend_necessity
        else "0::integer"
    )
    discretionary_variable = (
        "COALESCE(SUM(CASE WHEN t.cost_kind = 'variable' AND t.spend_necessity = 'discretionary' THEN -t.amount ELSE 0 END), 0)::integer"
        if include_spend_necessity
        else "0::integer"
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
            {essential_variable} AS essential_variable_total,
            {discretionary_variable} AS discretionary_variable_total,
            (
                COALESCE(SUM(CASE WHEN t.cost_kind = 'fixed' AND t.fixed_cost_necessity = 'essential' THEN -t.amount ELSE 0 END), 0)
                + {essential_variable}
            )::integer AS required_spend_total,
            (
                COALESCE(SUM(CASE WHEN t.cost_kind = 'fixed' AND t.fixed_cost_necessity = 'discretionary' THEN -t.amount ELSE 0 END), 0)
                + {discretionary_variable}
            )::integer AS discretionary_spend_total,
            COALESCE(SUM(CASE WHEN t.cost_kind IS NULL THEN -t.amount ELSE 0 END), 0)::integer AS unclassified_total,
            COUNT(CASE WHEN t.cost_kind IS NULL THEN 1 END)::integer AS unclassified_count
        FROM vw_transactions_effective t
        WHERE t.type = '지출'
          AND t.loan_account_id IS NULL
        GROUP BY to_char(t.date, 'YYYY-MM')
        """
    )


def _create_monthly_cashflow_view(*, include_spend_necessity: bool) -> None:
    essential_variable = (
        "COALESCE(SUM(CASE WHEN t.type = '지출' AND t.loan_account_id IS NULL AND t.cost_kind = 'variable' AND t.spend_necessity = 'essential' THEN -t.amount ELSE 0 END), 0)::integer"
        if include_spend_necessity
        else "0::integer"
    )
    discretionary_variable = (
        "COALESCE(SUM(CASE WHEN t.type = '지출' AND t.loan_account_id IS NULL AND t.cost_kind = 'variable' AND t.spend_necessity = 'discretionary' THEN -t.amount ELSE 0 END), 0)::integer"
        if include_spend_necessity
        else "0::integer"
    )
    op.execute(
        f"""
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
                {essential_variable} AS essential_variable_total,
                {discretionary_variable} AS discretionary_variable_total,
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
            essential_variable_total,
            discretionary_variable_total,
            (essential_fixed_total + essential_variable_total)::integer AS required_spend_total,
            (discretionary_fixed_total + discretionary_variable_total)::integer AS discretionary_spend_total,
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
        GROUP BY to_char(t.date, 'YYYY-MM'), t.loan_account_id, t.loan_display_name, t.loan_lender, t.loan_product_name, t.loan_kind, t.loan_maturity_date, t.loan_repayment_type
        """
    )


def _create_true_spendable_monthly_view(*, include_spend_necessity: bool) -> None:
    variable_columns = (
        "essential_variable_total AS required_variable_total, discretionary_variable_total,"
        if include_spend_necessity
        else "0::integer AS required_variable_total, 0::integer AS discretionary_variable_total,"
    )
    op.execute(
        f"""
        CREATE VIEW vw_true_spendable_monthly AS
        SELECT
            period,
            income_total,
            loan_repayment_total,
            fixed_total AS fixed_commitment_total,
            variable_total,
            {variable_columns}
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
            GROUP BY date_trunc('month', t.date)::date, to_char(t.date, 'YYYY-MM'), t.merchant, t.effective_category_major, t.effective_category_minor
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
            CASE WHEN trailing_3_month_avg IS NULL THEN NULL ELSE ROUND(monthly_spend - trailing_3_month_avg, 2) END AS baseline_delta,
            CASE WHEN trailing_3_month_avg IS NULL OR trailing_3_month_avg = 0 THEN NULL ELSE ROUND((monthly_spend - trailing_3_month_avg) / trailing_3_month_avg, 4) END AS baseline_delta_pct
        FROM with_baseline
        """
    )


def _create_recurring_merchant_monthly_view() -> None:
    op.execute(
        """
        CREATE VIEW vw_recurring_merchant_monthly AS
        SELECT
            to_char(t.date, 'YYYY-MM') AS period,
            t.merchant,
            t.recurring_payment_kind,
            COALESCE(SUM(-t.amount), 0)::integer AS monthly_spend,
            COUNT(*)::integer AS transaction_count,
            MIN(t.date) AS first_date,
            MAX(t.date) AS last_date
        FROM vw_transactions_effective t
        WHERE t.type = '지출'
          AND t.loan_account_id IS NULL
          AND t.recurring_payment_kind IS NOT NULL
          AND t.recurring_payment_kind <> 'not_recurring'
        GROUP BY to_char(t.date, 'YYYY-MM'), t.merchant, t.recurring_payment_kind
        """
    )


def _create_unclassified_work_queue_view(*, include_spend_necessity: bool) -> None:
    needs_spend = (
        "COALESCE((transaction_rows.cost_kind IS NOT NULL AND transaction_rows.spend_necessity IS NULL), FALSE)"
        if include_spend_necessity
        else "FALSE"
    )
    op.execute(
        f"""
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
                COALESCE(transaction_rows.cost_kind IS NULL, FALSE) AS needs_cost_kind,
                COALESCE((transaction_rows.cost_kind = 'fixed' AND transaction_rows.fixed_cost_necessity IS NULL), FALSE) AS needs_fixed_cost_necessity,
                {needs_spend} AS needs_spend_necessity,
                COALESCE((transaction_rows.recurring_payment_kind IS NULL AND (transaction_rows.cost_kind = 'fixed' OR transaction_rows.merchant_expense_count >= 2)), FALSE) AS needs_recurring_payment_kind,
                COALESCE((
                    transaction_rows.effective_category_major = '금융'
                    OR COALESCE(transaction_rows.effective_category_minor, '') ILIKE '%대출%'
                    OR COALESCE(transaction_rows.effective_category_minor, '') ILIKE '%상환%'
                    OR transaction_rows.description ILIKE '%대출%'
                    OR transaction_rows.description ILIKE '%상환%'
                    OR transaction_rows.merchant ILIKE '%대출%'
                    OR transaction_rows.merchant ILIKE '%상환%'
                ), FALSE) AS needs_loan_link_review
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
            needs_spend_necessity,
            needs_recurring_payment_kind,
            needs_loan_link_review,
            merchant_expense_count,
            (
                LEAST(amount_abs, 1000000)
                + CASE WHEN needs_loan_link_review THEN 50000 ELSE 0 END
                + CASE WHEN needs_cost_kind THEN 30000 ELSE 0 END
                + CASE WHEN needs_fixed_cost_necessity THEN 20000 ELSE 0 END
                + CASE WHEN needs_spend_necessity THEN 20000 ELSE 0 END
                + CASE WHEN needs_recurring_payment_kind THEN 10000 ELSE 0 END
                + CASE WHEN merchant_expense_count >= 2 THEN 5000 ELSE 0 END
            )::integer AS priority_score,
            CASE
                WHEN needs_loan_link_review THEN 'loan_link_review'
                WHEN needs_cost_kind THEN 'missing_cost_kind'
                WHEN needs_fixed_cost_necessity THEN 'missing_fixed_necessity'
                WHEN needs_spend_necessity THEN 'missing_spend_necessity'
                WHEN needs_recurring_payment_kind THEN 'missing_recurring_kind'
                ELSE 'review'
            END AS priority_reason
        FROM classified
        WHERE needs_cost_kind
           OR needs_fixed_cost_necessity
           OR needs_spend_necessity
           OR needs_recurring_payment_kind
           OR needs_loan_link_review
        """
    )


def _recreate_legacy_transactions_effective_view() -> None:
    _create_transactions_effective_view(include_spend_necessity=False)


def _recreate_legacy_advisor_views() -> None:
    _create_fixed_cost_monthly_summary_view(include_spend_necessity=False)
    _create_monthly_cashflow_view(include_spend_necessity=False)
    _create_loan_repayment_monthly_view()
    _create_true_spendable_monthly_view(include_spend_necessity=False)
    _create_merchant_monthly_baseline_view()
    _create_unclassified_work_queue_view(include_spend_necessity=False)
