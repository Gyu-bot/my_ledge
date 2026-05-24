"""add loan transaction mapping

Revision ID: 20260524_0007
Revises: 20260515_0006
Create Date: 2026-05-24 22:00:00
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "20260524_0007"
down_revision: str | None = "20260515_0006"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "loan_accounts",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("lender", sa.String(length=50), nullable=False),
        sa.Column("product_name", sa.String(length=200), nullable=False),
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
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "lender",
            "product_name",
            name="uq_loan_accounts_lender_product_name",
        ),
    )
    op.create_table(
        "loan_transaction_links",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("transaction_id", sa.Integer(), nullable=False),
        sa.Column("loan_account_id", sa.Integer(), nullable=False),
        sa.Column(
            "repayment_type",
            sa.String(length=20),
            server_default=sa.text("'unknown'"),
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
        sa.ForeignKeyConstraint(["loan_account_id"], ["loan_accounts.id"]),
        sa.ForeignKeyConstraint(["transaction_id"], ["transactions.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "transaction_id",
            name="uq_loan_transaction_links_transaction_id",
        ),
    )
    op.create_index(
        "idx_loan_transaction_links_loan_account_id",
        "loan_transaction_links",
        ["loan_account_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "idx_loan_transaction_links_loan_account_id",
        table_name="loan_transaction_links",
    )
    op.drop_table("loan_transaction_links")
    op.drop_table("loan_accounts")
