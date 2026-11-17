"""T065: 재업로드에 유지되는 할부 후보 검토 기록.

Revision ID: 20261117_0044
Revises: 20261117_0043
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20261117_0044"
down_revision: str | None = "20261117_0043"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "installment_candidate_reviews",
        sa.Column("series_key", sa.String(64), primary_key=True),
        sa.Column("review_status", sa.String(20), nullable=False),
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


def downgrade() -> None:
    op.drop_table("installment_candidate_reviews")
