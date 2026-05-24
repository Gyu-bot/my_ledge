"""add loan mapping fields to canonical transaction view

Revision ID: 20260524_0008
Revises: 20260524_0007
Create Date: 2026-05-24 23:12:00
"""

from collections.abc import Sequence

from alembic import op


revision: str = "20260524_0008"
down_revision: str | None = "20260524_0007"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
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


def downgrade() -> None:
    op.execute("DROP VIEW IF EXISTS vw_transactions_effective")
    op.execute(
        """
        CREATE VIEW vw_transactions_effective AS
        SELECT
            id,
            date,
            time,
            type,
            category_major,
            category_minor,
            category_major_user,
            category_minor_user,
            COALESCE(category_major_user, category_major) AS effective_category_major,
            COALESCE(category_minor_user, category_minor) AS effective_category_minor,
            description,
            merchant,
            amount,
            currency,
            payment_method,
            cost_kind,
            fixed_cost_necessity,
            memo,
            is_deleted,
            merged_into_id,
            CASE
                WHEN category_major_user IS NOT NULL
                  OR category_minor_user IS NOT NULL
                  OR merchant <> description
                  OR memo IS NOT NULL
                THEN TRUE
                ELSE FALSE
            END AS is_edited,
            source,
            created_at,
            updated_at
        FROM transactions
        WHERE is_deleted = FALSE
          AND merged_into_id IS NULL
        """
    )
