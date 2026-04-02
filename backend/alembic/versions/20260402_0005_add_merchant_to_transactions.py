"""add merchant column to transactions

Revision ID: 20260402_0005
Revises: 20260330_0004
Create Date: 2026-04-02 13:10:00
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "20260402_0005"
down_revision: str | None = "20260330_0004"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("transactions", sa.Column("merchant", sa.String(length=500), nullable=True))
    op.execute("UPDATE transactions SET merchant = description WHERE merchant IS NULL")
    op.alter_column("transactions", "merchant", nullable=False)

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

    op.drop_column("transactions", "merchant")
