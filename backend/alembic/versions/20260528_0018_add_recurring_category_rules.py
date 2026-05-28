"""add recurring category rules

Revision ID: 20260528_0018
Revises: 20260528_0017
Create Date: 2026-05-28 23:50:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260528_0018"
down_revision: str | None = "20260528_0017"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "auto_classification_settings",
        sa.Column(
            "apply_recurring_rules_on_upload",
            sa.Boolean(),
            server_default=sa.false(),
            nullable=False,
        ),
    )
    op.create_table(
        "recurring_category_rules",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("category_major", sa.String(length=50), nullable=False),
        sa.Column("category_minor", sa.String(length=50), nullable=True),
        sa.Column("recurring_payment_kind", sa.String(length=30), nullable=False),
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
            "category_major",
            "category_minor",
            name="uq_recurring_category_rules_category",
        ),
    )

    rules_table = sa.table(
        "recurring_category_rules",
        sa.column("category_major", sa.String),
        sa.column("category_minor", sa.String),
        sa.column("recurring_payment_kind", sa.String),
    )
    op.bulk_insert(
        rules_table,
        [
            {
                "category_major": "구독",
                "category_minor": None,
                "recurring_payment_kind": "monthly_recurring",
            },
            {
                "category_major": "통신",
                "category_minor": None,
                "recurring_payment_kind": "monthly_recurring",
            },
            {
                "category_major": "주거/통신",
                "category_minor": None,
                "recurring_payment_kind": "monthly_recurring",
            },
            {
                "category_major": "보험",
                "category_minor": None,
                "recurring_payment_kind": "monthly_recurring",
            },
        ],
    )


def downgrade() -> None:
    op.drop_table("recurring_category_rules")
    op.drop_column("auto_classification_settings", "apply_recurring_rules_on_upload")
