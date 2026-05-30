"""add installment management

Revision ID: 20260530_0023
Revises: 20260530_0022
Create Date: 2026-05-30 00:23:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "20260530_0023"
down_revision: str | None = "20260530_0022"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "installment_plans",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("display_name", sa.String(length=200), nullable=False),
        sa.Column("merchant", sa.String(length=500), nullable=False),
        sa.Column("payment_method", sa.String(length=100), nullable=True),
        sa.Column("total_installments", sa.Integer(), nullable=False),
        sa.Column("monthly_amount", sa.Integer(), nullable=False),
        sa.Column("first_payment_date", sa.Date(), nullable=False),
        sa.Column(
            "status",
            sa.String(length=20),
            server_default=sa.text("'active'"),
            nullable=False,
        ),
        sa.Column("memo", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_table(
        "installment_transaction_links",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("transaction_id", sa.Integer(), nullable=False),
        sa.Column("installment_plan_id", sa.Integer(), nullable=False),
        sa.Column("installment_number", sa.Integer(), nullable=False),
        sa.Column(
            "source",
            sa.String(length=20),
            server_default=sa.text("'manual'"),
            nullable=False,
        ),
        sa.Column("memo", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["transaction_id"], ["transactions.id"]),
        sa.ForeignKeyConstraint(["installment_plan_id"], ["installment_plans.id"]),
        sa.UniqueConstraint(
            "transaction_id",
            name="uq_installment_transaction_links_transaction_id",
        ),
        sa.UniqueConstraint(
            "installment_plan_id",
            "installment_number",
            name="uq_installment_transaction_links_plan_number",
        ),
    )
    op.create_index(
        "idx_installment_transaction_links_plan_id",
        "installment_transaction_links",
        ["installment_plan_id"],
        unique=False,
    )
    op.execute(
        """
        UPDATE transactions
        SET spend_necessity = 'discretionary'
        WHERE cost_kind = 'variable'
          AND spend_necessity IS NULL
        """
    )
    op.execute(
        """
        UPDATE category_classification_rules
        SET spend_necessity = 'discretionary'
        WHERE cost_kind = 'variable'
          AND spend_necessity IS NULL
        """
    )


def downgrade() -> None:
    op.drop_index(
        "idx_installment_transaction_links_plan_id",
        table_name="installment_transaction_links",
    )
    op.drop_table("installment_transaction_links")
    op.drop_table("installment_plans")
