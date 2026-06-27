from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "20260627_0030"
down_revision: str | None = "20260627_0029"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "loan_candidate_reviews",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("candidate_key", sa.String(length=120), nullable=False),
        sa.Column("candidate_type", sa.String(length=50), nullable=False),
        sa.Column("transaction_id", sa.Integer(), nullable=False),
        sa.Column("review_status", sa.String(length=20), nullable=False),
        sa.Column("memo", sa.Text(), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
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
            ["transaction_id"],
            ["transactions.id"],
            name=op.f("fk_loan_candidate_reviews_transaction_id_transactions"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_loan_candidate_reviews")),
        sa.UniqueConstraint(
            "candidate_key",
            name="uq_loan_candidate_reviews_candidate_key",
        ),
        sa.UniqueConstraint(
            "transaction_id",
            name="uq_loan_candidate_reviews_transaction_id",
        ),
    )


def downgrade() -> None:
    op.drop_table("loan_candidate_reviews")
