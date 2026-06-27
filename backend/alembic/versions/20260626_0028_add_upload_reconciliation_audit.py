from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "20260626_0028"
down_revision: str | None = "20260626_0027"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "upload_logs",
        sa.Column("reconciliation_mode", sa.String(length=30), nullable=True),
    )
    op.add_column(
        "upload_logs",
        sa.Column("reconciliation_audit", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("upload_logs", "reconciliation_audit")
    op.drop_column("upload_logs", "reconciliation_mode")
