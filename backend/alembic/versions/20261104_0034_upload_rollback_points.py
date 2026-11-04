"""Add per-import ledger rollback points (no existing data mutation)."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "20261104_0034"
down_revision = "20261023_0033"
branch_labels = None
depends_on = None


def upgrade():
    document = sa.JSON().with_variant(postgresql.JSONB(), "postgresql")
    op.create_table(
        "upload_rollback_points",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "upload_log_id",
            sa.Integer(),
            sa.ForeignKey(
                "upload_logs.id",
                name="fk_upload_rollback_points_upload_log_id_upload_logs",
            ),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("snapshot", document, nullable=True),
        sa.Column("pre_fingerprint", document, nullable=True),
        sa.Column("post_fingerprint", document, nullable=True),
        sa.Column("rolled_back_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint(
            "upload_log_id", name="uq_upload_rollback_points_upload_log_id"
        ),
    )


def downgrade():
    op.drop_table("upload_rollback_points")
