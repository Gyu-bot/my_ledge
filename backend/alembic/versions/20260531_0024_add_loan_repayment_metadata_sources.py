"""add loan repayment metadata sources

Revision ID: 20260531_0024
Revises: 20260530_0023
Create Date: 2026-05-31 00:24:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "20260531_0024"
down_revision: str | None = "20260530_0023"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "loans",
        sa.Column("monthly_payment_source", sa.String(length=50), nullable=True),
    )
    op.add_column(
        "loans",
        sa.Column("repayment_method_source", sa.String(length=50), nullable=True),
    )
    op.execute(
        """
        UPDATE loans
        SET monthly_payment_source = 'manual'
        WHERE monthly_payment IS NOT NULL
        """
    )
    op.execute(
        """
        UPDATE loans
        SET repayment_method_source = 'manual'
        WHERE repayment_method IS NOT NULL
        """
    )


def downgrade() -> None:
    op.drop_column("loans", "repayment_method_source")
    op.drop_column("loans", "monthly_payment_source")
