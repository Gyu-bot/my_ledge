"""add purchase gate review state

Revision ID: 20260530_0021
Revises: 20260530_0020
Create Date: 2026-05-30 22:20:00.000000

"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "20260530_0021"
down_revision: str | None = "20260530_0020"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "purchase_gate_reviews",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("candidate_key", sa.String(length=120), nullable=False),
        sa.Column("candidate_type", sa.String(length=50), nullable=False),
        sa.Column("transaction_id", sa.Integer(), nullable=False),
        sa.Column("review_status", sa.String(length=20), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_purchase_gate_reviews")),
        sa.UniqueConstraint("candidate_key", name="uq_purchase_gate_reviews_candidate_key"),
    )


def downgrade() -> None:
    op.drop_table("purchase_gate_reviews")
