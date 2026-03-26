"""add cost classification fields to transactions

Revision ID: 20260326_0003
Revises: 20260326_0002
Create Date: 2026-03-26 19:10:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "20260326_0003"
down_revision: str | None = "20260326_0002"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("transactions", sa.Column("cost_kind", sa.String(length=20), nullable=True))
    op.add_column(
        "transactions",
        sa.Column("fixed_cost_necessity", sa.String(length=20), nullable=True),
    )
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
        """
    )
    op.drop_column("transactions", "fixed_cost_necessity")
    op.drop_column("transactions", "cost_kind")
