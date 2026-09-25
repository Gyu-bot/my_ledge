"""Keep external valuation and FX provenance without storing auth payloads."""

import sqlalchemy as sa
from alembic import op

revision = "20260924_0032"
down_revision = "20260924_0031"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "asset_source_runs",
        sa.Column("provenance", sa.JSON(), nullable=False, server_default="{}"),
    )


def downgrade():
    op.drop_column("asset_source_runs", "provenance")
