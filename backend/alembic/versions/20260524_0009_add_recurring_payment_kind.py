"""add recurring payment classification

Revision ID: 20260524_0009
Revises: 20260524_0008
Create Date: 2026-05-24 23:35:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "20260524_0009"
down_revision: str | None = "20260524_0008"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "transactions",
        sa.Column("recurring_payment_kind", sa.String(length=30), nullable=True),
    )
    op.execute("DROP VIEW IF EXISTS vw_transactions_effective")
    op.execute(
        """
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
            t.recurring_payment_kind,
            t.memo,
            ltl.loan_account_id,
            la.lender AS loan_lender,
            la.product_name AS loan_product_name,
            ltl.repayment_type AS loan_repayment_type,
            ltl.memo AS loan_link_memo,
            t.is_deleted,
            t.merged_into_id,
            CASE
                WHEN t.category_major_user IS NOT NULL
                  OR t.category_minor_user IS NOT NULL
                  OR t.merchant <> t.description
                  OR t.cost_kind IS NOT NULL
                  OR t.fixed_cost_necessity IS NOT NULL
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


def downgrade() -> None:
    op.execute("DROP VIEW IF EXISTS vw_transactions_effective")
    op.execute(
        """
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
            t.memo,
            ltl.loan_account_id,
            la.lender AS loan_lender,
            la.product_name AS loan_product_name,
            ltl.repayment_type AS loan_repayment_type,
            ltl.memo AS loan_link_memo,
            t.is_deleted,
            t.merged_into_id,
            CASE
                WHEN t.category_major_user IS NOT NULL
                  OR t.category_minor_user IS NOT NULL
                  OR t.merchant <> t.description
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
    op.drop_column("transactions", "recurring_payment_kind")
