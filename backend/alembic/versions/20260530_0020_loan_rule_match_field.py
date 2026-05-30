"""add loan merchant rule match field

Revision ID: 20260530_0020
Revises: 20260530_0019
Create Date: 2026-05-30 20:05:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "20260530_0020"
down_revision: str | None = "20260530_0019"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "loan_merchant_rules",
        sa.Column(
            "match_field",
            sa.String(20),
            nullable=False,
            server_default="merchant",
        ),
    )
    op.drop_constraint(
        "uq_loan_merchant_rules_merchant",
        "loan_merchant_rules",
        type_="unique",
    )
    op.create_unique_constraint(
        "uq_loan_merchant_rules_match_field_merchant",
        "loan_merchant_rules",
        ["match_field", "merchant"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "uq_loan_merchant_rules_match_field_merchant",
        "loan_merchant_rules",
        type_="unique",
    )
    op.create_unique_constraint(
        "uq_loan_merchant_rules_merchant",
        "loan_merchant_rules",
        ["merchant"],
    )
    op.drop_column("loan_merchant_rules", "match_field")
