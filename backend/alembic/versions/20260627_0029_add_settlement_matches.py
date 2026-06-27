from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "20260627_0029"
down_revision: str | None = "20260626_0028"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "settlement_matches",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("original_transaction_id", sa.Integer(), nullable=False),
        sa.Column("settlement_transaction_id", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("matched_amount", sa.Integer(), nullable=False),
        sa.Column("matched_at", sa.DateTime(timezone=True), nullable=True),
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
        sa.ForeignKeyConstraint(
            ["original_transaction_id"],
            ["transactions.id"],
            name=op.f("fk_settlement_matches_original_transaction_id_transactions"),
        ),
        sa.ForeignKeyConstraint(
            ["settlement_transaction_id"],
            ["transactions.id"],
            name=op.f("fk_settlement_matches_settlement_transaction_id_transactions"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_settlement_matches")),
        sa.UniqueConstraint(
            "original_transaction_id",
            "settlement_transaction_id",
            name="uq_settlement_matches_original_refund",
        ),
    )
    op.create_index(
        "idx_settlement_matches_settlement_transaction_id",
        "settlement_matches",
        ["settlement_transaction_id"],
        unique=False,
    )
    op.create_index(
        "idx_settlement_matches_status",
        "settlement_matches",
        ["status"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "idx_settlement_matches_status",
        table_name="settlement_matches",
    )
    op.drop_index(
        "idx_settlement_matches_settlement_transaction_id",
        table_name="settlement_matches",
    )
    op.drop_table("settlement_matches")
