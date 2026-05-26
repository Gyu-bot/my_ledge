"""add loan dates to canonical view

Revision ID: 20260526_0014
Revises: 20260526_0013
Create Date: 2026-05-26 20:40:00
"""

from collections.abc import Sequence

from alembic import op


revision: str = "20260526_0014"
down_revision: str | None = "20260526_0013"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    _recreate_transactions_effective_view(include_loan_dates=True)


def downgrade() -> None:
    _recreate_transactions_effective_view(include_loan_dates=False)


def _recreate_transactions_effective_view(*, include_loan_dates: bool) -> None:
    op.execute("DROP VIEW IF EXISTS vw_transactions_effective")
    loan_date_columns = (
        """
            ll.loan_start_date AS loan_start_date,
            ll.loan_maturity_date AS loan_maturity_date,
        """
        if include_loan_dates
        else ""
    )
    latest_loans_cte = (
        """
        WITH latest_loans AS (
            SELECT
                l.lender,
                l.product_name,
                l.start_date AS loan_start_date,
                l.maturity_date AS loan_maturity_date
            FROM loans l
            JOIN (
                SELECT
                    lender,
                    product_name,
                    MAX(snapshot_date) AS latest_snapshot_date
                FROM loans
                GROUP BY lender, product_name
            ) latest
              ON latest.lender = l.lender
             AND latest.product_name = l.product_name
             AND latest.latest_snapshot_date = l.snapshot_date
        )
        """
        if include_loan_dates
        else ""
    )
    latest_loans_join = (
        """
        LEFT JOIN latest_loans ll
          ON ll.lender = la.lender
         AND ll.product_name = la.product_name
        """
        if include_loan_dates
        else ""
    )

    op.execute(
        f"""
        CREATE VIEW vw_transactions_effective AS
        {latest_loans_cte}
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
            t.cost_classification_source,
            t.recurring_payment_kind,
            t.memo,
            ltl.loan_account_id,
            la.lender AS loan_lender,
            la.product_name AS loan_product_name,
            COALESCE(la.display_name_user, la.lender || ' ' || la.product_name) AS loan_display_name,
            la.loan_kind AS loan_kind,
            {loan_date_columns}
            ltl.repayment_type AS loan_repayment_type,
            ltl.memo AS loan_link_memo,
            t.is_deleted,
            t.merged_into_id,
            CASE
                WHEN t.category_major_user IS NOT NULL
                  OR t.category_minor_user IS NOT NULL
                  OR t.merchant <> t.description
                  OR t.cost_classification_source = 'manual'
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
        {latest_loans_join}
        WHERE t.is_deleted = FALSE
          AND t.merged_into_id IS NULL
        """
    )
