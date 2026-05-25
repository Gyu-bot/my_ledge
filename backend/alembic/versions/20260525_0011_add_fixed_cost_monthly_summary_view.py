"""add fixed cost monthly summary view

Revision ID: 20260525_0011
Revises: 20260525_0010
Create Date: 2026-05-25 23:05:00
"""

from collections.abc import Sequence

from alembic import op


revision: str = "20260525_0011"
down_revision: str | None = "20260525_0010"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
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
        FROM transactions t
        WHERE t.type = '지출'
          AND t.is_deleted = FALSE
          AND t.merged_into_id IS NULL
        GROUP BY to_char(t.date, 'YYYY-MM')
        """
    )


def downgrade() -> None:
    op.execute("DROP VIEW IF EXISTS vw_fixed_cost_monthly_summary")
