"""add transaction source lifecycle

Revision ID: 20260626_0027
Revises: 20260624_0026
Create Date: 2026-06-26 00:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "20260626_0027"
down_revision: str | None = "20260624_0026"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "transactions",
        sa.Column(
            "source_lifecycle_status",
            sa.String(length=40),
            nullable=False,
            server_default="active",
        ),
    )
    op.add_column(
        "transactions",
        sa.Column("source_row_hash", sa.String(length=64), nullable=True),
    )
    op.add_column(
        "transactions",
        sa.Column("first_seen_import_id", sa.Integer(), nullable=True),
    )
    op.add_column(
        "transactions",
        sa.Column("last_seen_import_id", sa.Integer(), nullable=True),
    )
    op.add_column(
        "transactions",
        sa.Column("source_first_seen_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "transactions",
        sa.Column("source_last_seen_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "transactions",
        sa.Column("superseded_by_transaction_id", sa.Integer(), nullable=True),
    )
    if _supports_alter_constraints():
        op.create_foreign_key(
            "fk_transactions_first_seen_import_id_upload_logs",
            "transactions",
            "upload_logs",
            ["first_seen_import_id"],
            ["id"],
        )
        op.create_foreign_key(
            "fk_transactions_last_seen_import_id_upload_logs",
            "transactions",
            "upload_logs",
            ["last_seen_import_id"],
            ["id"],
        )
        op.create_foreign_key(
            "fk_transactions_superseded_by_transaction_id_transactions",
            "transactions",
            "transactions",
            ["superseded_by_transaction_id"],
            ["id"],
        )
    op.create_index(
        "idx_transactions_source_lifecycle_status",
        "transactions",
        ["source_lifecycle_status"],
        unique=False,
    )
    op.create_index(
        "idx_transactions_source_row_hash",
        "transactions",
        ["source_row_hash"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("idx_transactions_source_row_hash", table_name="transactions")
    op.drop_index(
        "idx_transactions_source_lifecycle_status",
        table_name="transactions",
    )
    if _supports_alter_constraints():
        op.drop_constraint(
            "fk_transactions_superseded_by_transaction_id_transactions",
            "transactions",
            type_="foreignkey",
        )
        op.drop_constraint(
            "fk_transactions_last_seen_import_id_upload_logs",
            "transactions",
            type_="foreignkey",
        )
        op.drop_constraint(
            "fk_transactions_first_seen_import_id_upload_logs",
            "transactions",
            type_="foreignkey",
        )
    op.drop_column("transactions", "superseded_by_transaction_id")
    op.drop_column("transactions", "source_last_seen_at")
    op.drop_column("transactions", "source_first_seen_at")
    op.drop_column("transactions", "last_seen_import_id")
    op.drop_column("transactions", "first_seen_import_id")
    op.drop_column("transactions", "source_row_hash")
    op.drop_column("transactions", "source_lifecycle_status")


def _supports_alter_constraints() -> bool:
    return op.get_context().dialect.name != "sqlite"
