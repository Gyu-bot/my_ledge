"""add loan account display name

Revision ID: 20260526_0012
Revises: 20260525_0011
Create Date: 2026-05-26 19:58:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "20260526_0012"
down_revision: str | None = "20260525_0011"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "loan_accounts",
        sa.Column("display_name_user", sa.String(length=200), nullable=True),
    )
    _recreate_transactions_effective_view(include_display_name=True)


def downgrade() -> None:
    op.execute("DROP VIEW IF EXISTS vw_transactions_effective")
    op.drop_column("loan_accounts", "display_name_user")
    _recreate_transactions_effective_view(include_display_name=False)


def _recreate_transactions_effective_view(*, include_display_name: bool) -> None:
    op.execute("DROP VIEW IF EXISTS vw_transactions_effective")
    loan_display_name_column = (
        "COALESCE(la.display_name_user, la.lender || ' ' || la.product_name) AS loan_display_name,"
        if include_display_name
        else ""
    )
    op.execute(
        f"""
        CREATE VIEW vw_transactions_effective AS
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
            {loan_display_name_column}
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
        WHERE t.is_deleted = FALSE
          AND t.merged_into_id IS NULL
        """
    )
