"""initial schema

Revision ID: 20260323_0001
Revises:
Create Date: 2026-03-23 20:00:00
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "20260323_0001"
down_revision: str | None = None
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "transactions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("time", sa.Time(), nullable=False),
        sa.Column("type", sa.String(length=10), nullable=False),
        sa.Column("category_major", sa.String(length=50), nullable=False),
        sa.Column("category_minor", sa.String(length=50), nullable=True),
        sa.Column("category_major_user", sa.String(length=50), nullable=True),
        sa.Column("category_minor_user", sa.String(length=50), nullable=True),
        sa.Column("description", sa.String(length=500), nullable=False),
        sa.Column("amount", sa.Integer(), nullable=False),
        sa.Column("currency", sa.String(length=5), server_default=sa.text("'KRW'"), nullable=False),
        sa.Column("payment_method", sa.String(length=100), nullable=True),
        sa.Column("memo", sa.Text(), nullable=True),
        sa.Column("is_deleted", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("merged_into_id", sa.Integer(), nullable=True),
        sa.Column("source", sa.String(length=10), server_default=sa.text("'import'"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["merged_into_id"], ["transactions.id"], name=op.f("fk_transactions_merged_into_id_transactions")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_transactions")),
    )
    op.create_index("idx_tx_datetime", "transactions", ["date", "time"], unique=False)

    op.create_table(
        "asset_snapshots",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("snapshot_date", sa.Date(), nullable=False),
        sa.Column("side", sa.String(length=10), nullable=False),
        sa.Column("category", sa.String(length=50), nullable=False),
        sa.Column("product_name", sa.String(length=200), nullable=False),
        sa.Column("amount", sa.Numeric(15, 2), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_asset_snapshots")),
        sa.UniqueConstraint("snapshot_date", "side", "category", "product_name", name=op.f("uq_asset_snapshots_snapshot_date_side_category_product_name")),
    )

    op.create_table(
        "investments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("snapshot_date", sa.Date(), nullable=False),
        sa.Column("product_type", sa.String(length=20), nullable=True),
        sa.Column("broker", sa.String(length=50), nullable=False),
        sa.Column("product_name", sa.String(length=200), nullable=False),
        sa.Column("cost_basis", sa.Numeric(15, 2), nullable=True),
        sa.Column("market_value", sa.Numeric(15, 2), nullable=True),
        sa.Column("return_rate", sa.Numeric(8, 4), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_investments")),
        sa.UniqueConstraint("snapshot_date", "broker", "product_name", name=op.f("uq_investments_snapshot_date_broker_product_name")),
    )

    op.create_table(
        "loans",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("snapshot_date", sa.Date(), nullable=False),
        sa.Column("loan_type", sa.String(length=30), nullable=True),
        sa.Column("lender", sa.String(length=50), nullable=False),
        sa.Column("product_name", sa.String(length=200), nullable=False),
        sa.Column("principal", sa.Numeric(15, 2), nullable=True),
        sa.Column("balance", sa.Numeric(15, 2), nullable=True),
        sa.Column("interest_rate", sa.Numeric(5, 2), nullable=True),
        sa.Column("start_date", sa.Date(), nullable=True),
        sa.Column("maturity_date", sa.Date(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_loans")),
        sa.UniqueConstraint("snapshot_date", "lender", "product_name", name=op.f("uq_loans_snapshot_date_lender_product_name")),
    )

    op.create_table(
        "upload_logs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("uploaded_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("filename", sa.String(length=200), nullable=True),
        sa.Column("snapshot_date", sa.Date(), nullable=True),
        sa.Column("tx_total", sa.Integer(), nullable=True),
        sa.Column("tx_new", sa.Integer(), nullable=True),
        sa.Column("tx_skipped", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_upload_logs")),
    )


def downgrade() -> None:
    op.drop_table("upload_logs")
    op.drop_table("loans")
    op.drop_table("investments")
    op.drop_table("asset_snapshots")
    op.drop_index("idx_tx_datetime", table_name="transactions")
    op.drop_table("transactions")
