"""two-axis nature tables (T056): recurring commitments, category defaults, overrides

New tables only. No column, index, or constraint is added to ``transactions``
or to any other existing table, so the import contract (upload preview/apply,
review prepare/decisions/apply, rollback points, upload logs) and table
structure fingerprints of existing tables are unchanged.

Revision ID: 20261115_0036
Revises: 20261115_0035
Create Date: 2026-11-15 00:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20261115_0036"
down_revision: str | None = "20261115_0035"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def _timestamps() -> list[sa.Column]:
    return [
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
    ]


def upgrade() -> None:
    op.create_table(
        "recurring_commitments",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("label", sa.String(200), nullable=True),
        sa.Column("match_scope", sa.String(20), nullable=False),
        sa.Column("merchant", sa.String(500), nullable=True),
        sa.Column("category_major", sa.String(50), nullable=False),
        sa.Column("category_minor", sa.String(50), nullable=True),
        sa.Column("cycle", sa.String(20), nullable=True),
        sa.Column("total_count", sa.Integer(), nullable=True),
        sa.Column("amount_kind", sa.String(20), nullable=True),
        sa.Column("adjustability", sa.String(20), nullable=True),
        sa.Column("start_date", sa.Date(), nullable=True),
        sa.Column("end_date", sa.Date(), nullable=True),
        sa.Column("origin", sa.String(20), nullable=False),
        sa.Column("memo", sa.Text(), nullable=True),
        *_timestamps(),
        sa.PrimaryKeyConstraint("id", name="pk_recurring_commitments"),
    )
    op.create_index(
        "ix_recurring_commitments_category_merchant",
        "recurring_commitments",
        ["category_major", "merchant"],
    )
    op.create_table(
        "category_adjustability_defaults",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("category_major", sa.String(50), nullable=False),
        sa.Column("category_minor", sa.String(50), nullable=True),
        sa.Column("adjustability", sa.String(20), nullable=False),
        *_timestamps(),
        sa.PrimaryKeyConstraint("id", name="pk_category_adjustability_defaults"),
        sa.UniqueConstraint(
            "category_major",
            "category_minor",
            name="uq_category_adjustability_defaults_category",
        ),
    )
    op.create_table(
        "transaction_nature_overrides",
        sa.Column("transaction_id", sa.Integer(), nullable=False),
        sa.Column("adjustability", sa.String(20), nullable=True),
        sa.Column("commitment_id", sa.Integer(), nullable=True),
        sa.Column(
            "excluded_from_commitments",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
        sa.Column(
            "installment_link_unconfirmed",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
        sa.Column(
            "necessity_conflict",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
        sa.Column("source", sa.String(20), nullable=False),
        *_timestamps(),
        sa.PrimaryKeyConstraint(
            "transaction_id", name="pk_transaction_nature_overrides"
        ),
        sa.ForeignKeyConstraint(
            ["transaction_id"],
            ["transactions.id"],
            name="fk_transaction_nature_overrides_transaction_id_transactions",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["commitment_id"],
            ["recurring_commitments.id"],
            name="fk_transaction_nature_overrides_commitment_id",
            ondelete="SET NULL",
        ),
    )


def downgrade() -> None:
    op.drop_table("transaction_nature_overrides")
    op.drop_table("category_adjustability_defaults")
    op.drop_index(
        "ix_recurring_commitments_category_merchant",
        table_name="recurring_commitments",
    )
    op.drop_table("recurring_commitments")
