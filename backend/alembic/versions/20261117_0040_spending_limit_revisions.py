"""T062: additive, empty table for immutable human limit history.

Revision ID: 20261117_0040
Revises: 20261117_t054_t057
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20261117_0040"
down_revision: str | None = "20261117_t054_t057"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "spending_limit_revisions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("target_kind", sa.String(20), nullable=False),
        sa.Column("target_value", sa.String(50), nullable=False),
        sa.Column("effective_from_period", sa.String(7), nullable=False),
        sa.Column("amount", sa.BigInteger(), nullable=True),
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
        sa.PrimaryKeyConstraint("id", name="pk_spending_limit_revisions"),
        sa.UniqueConstraint(
            "target_kind",
            "target_value",
            "effective_from_period",
            name="uq_spending_limit_revisions_target_kind",
        ),
        sa.CheckConstraint(
            "target_kind IN ('category', 'adjustability')",
            name=op.f("ck_spending_limit_revisions_target_kind"),
        ),
        sa.CheckConstraint(
            "target_kind = 'category' OR target_value IN ('protected', 'adjustable', 'undecided')",
            name=op.f("ck_spending_limit_revisions_adjustability_value"),
        ),
        sa.CheckConstraint(
            "amount IS NULL OR amount >= 0",
            name=op.f("ck_spending_limit_revisions_nonnegative_amount"),
        ),
    )


def downgrade() -> None:
    op.drop_table("spending_limit_revisions")
