"""add canonical views

Revision ID: 20260326_0002
Revises: 20260323_0001
Create Date: 2026-03-26 13:20:00
"""

from collections.abc import Sequence

from alembic import op


revision: str = "20260326_0002"
down_revision: str | None = "20260323_0001"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
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
    op.execute(
        """
        CREATE VIEW vw_category_monthly_spend AS
        SELECT
            to_char(date, 'YYYY-MM') AS period,
            COALESCE(category_major_user, category_major) AS category_major,
            COALESCE(category_minor_user, category_minor) AS category_minor,
            SUM(amount)::integer AS amount
        FROM transactions
        WHERE is_deleted = FALSE
          AND merged_into_id IS NULL
          AND type = '지출'
        GROUP BY
            to_char(date, 'YYYY-MM'),
            COALESCE(category_major_user, category_major),
            COALESCE(category_minor_user, category_minor)
        """
    )


def downgrade() -> None:
    op.execute("DROP VIEW IF EXISTS vw_category_monthly_spend")
    op.execute("DROP VIEW IF EXISTS vw_transactions_effective")
