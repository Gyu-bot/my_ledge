"""Add durable, exact reviewed import operations (no existing data mutation)."""

import sqlalchemy as sa
from alembic import op

revision = "20261023_0033"
down_revision = "20260924_0032"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "upload_review_operations",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("binding_digest", sa.String(64), nullable=False),
        sa.Column("state_digest", sa.String(64), nullable=False),
        sa.Column("file_sha256", sa.String(64), nullable=False),
        sa.Column("snapshot_date", sa.Date(), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("plan_digest", sa.String(64), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("applied_request_digest", sa.String(64), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index(
        "ix_upload_review_operations_binding_digest",
        "upload_review_operations",
        ["binding_digest"],
    )


def downgrade():
    op.drop_index(
        "ix_upload_review_operations_binding_digest",
        table_name="upload_review_operations",
    )
    op.drop_table("upload_review_operations")
