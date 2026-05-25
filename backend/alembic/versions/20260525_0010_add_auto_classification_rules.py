"""add auto classification rules

Revision ID: 20260525_0010
Revises: 20260524_0009
Create Date: 2026-05-25 14:40:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "20260525_0010"
down_revision: str | None = "20260524_0009"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "transactions",
        sa.Column("cost_classification_source", sa.String(length=20), nullable=True),
    )
    op.execute(
        """
        UPDATE transactions
        SET cost_classification_source = 'manual'
        WHERE cost_kind IS NOT NULL
           OR fixed_cost_necessity IS NOT NULL
        """
    )
    op.add_column(
        "loan_transaction_links",
        sa.Column(
            "source",
            sa.String(length=20),
            nullable=False,
            server_default=sa.text("'manual'"),
        ),
    )

    op.create_table(
        "category_classification_rules",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("category_major", sa.String(length=50), nullable=False),
        sa.Column("category_minor", sa.String(length=50), nullable=True),
        sa.Column("cost_kind", sa.String(length=20), nullable=False),
        sa.Column("fixed_cost_necessity", sa.String(length=20), nullable=True),
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
            name="uq_category_classification_rules_category",
        ),
    )
    op.create_table(
        "loan_merchant_rules",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("merchant", sa.String(length=500), nullable=False),
        sa.Column("loan_account_id", sa.Integer(), nullable=False),
        sa.Column("repayment_type", sa.String(length=20), nullable=False),
        sa.Column("memo", sa.Text(), nullable=True),
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
        sa.ForeignKeyConstraint(["loan_account_id"], ["loan_accounts.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("merchant", name="uq_loan_merchant_rules_merchant"),
    )
    op.create_table(
        "auto_classification_settings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column(
            "apply_cost_rules_on_upload",
            sa.Boolean(),
            server_default=sa.false(),
            nullable=False,
        ),
        sa.Column(
            "apply_loan_rules_on_upload",
            sa.Boolean(),
            server_default=sa.false(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )

    rules_table = sa.table(
        "category_classification_rules",
        sa.column("category_major", sa.String),
        sa.column("category_minor", sa.String),
        sa.column("cost_kind", sa.String),
        sa.column("fixed_cost_necessity", sa.String),
    )
    op.bulk_insert(
        rules_table,
        [
            {
                "category_major": "주거",
                "category_minor": None,
                "cost_kind": "fixed",
                "fixed_cost_necessity": "essential",
            },
            {
                "category_major": "통신",
                "category_minor": None,
                "cost_kind": "fixed",
                "fixed_cost_necessity": "essential",
            },
            {
                "category_major": "보험",
                "category_minor": None,
                "cost_kind": "fixed",
                "fixed_cost_necessity": "essential",
            },
            {
                "category_major": "구독",
                "category_minor": None,
                "cost_kind": "fixed",
                "fixed_cost_necessity": "discretionary",
            },
            {
                "category_major": "금융",
                "category_minor": None,
                "cost_kind": "fixed",
                "fixed_cost_necessity": "essential",
            },
            {
                "category_major": "식비",
                "category_minor": None,
                "cost_kind": "variable",
                "fixed_cost_necessity": None,
            },
            {
                "category_major": "교통",
                "category_minor": None,
                "cost_kind": "variable",
                "fixed_cost_necessity": None,
            },
            {
                "category_major": "쇼핑",
                "category_minor": None,
                "cost_kind": "variable",
                "fixed_cost_necessity": None,
            },
            {
                "category_major": "생활",
                "category_minor": None,
                "cost_kind": "variable",
                "fixed_cost_necessity": None,
            },
            {
                "category_major": "문화/여가",
                "category_minor": None,
                "cost_kind": "variable",
                "fixed_cost_necessity": None,
            },
        ],
    )
    _recreate_transactions_effective_view()


def downgrade() -> None:
    op.execute("DROP VIEW IF EXISTS vw_transactions_effective")
    op.drop_table("auto_classification_settings")
    op.drop_table("loan_merchant_rules")
    op.drop_table("category_classification_rules")
    op.drop_column("loan_transaction_links", "source")
    op.drop_column("transactions", "cost_classification_source")
    op.execute(
        """
        CREATE VIEW vw_transactions_effective AS
        SELECT
            t.id,
            t.date,
            t.time,
            t.type,
            t.category_major,
            t.category_minor,
            t.category_major_user,
            t.category_minor_user,
            COALESCE(t.category_major_user, t.category_major) AS effective_category_major,
            COALESCE(t.category_minor_user, t.category_minor) AS effective_category_minor,
            t.description,
            t.merchant,
            t.amount,
            t.currency,
            t.payment_method,
            t.cost_kind,
            t.fixed_cost_necessity,
            t.recurring_payment_kind,
            t.memo,
            ltl.loan_account_id,
            la.lender AS loan_lender,
            la.product_name AS loan_product_name,
            ltl.repayment_type AS loan_repayment_type,
            ltl.memo AS loan_link_memo,
            t.is_deleted,
            t.merged_into_id,
            CASE
                WHEN t.category_major_user IS NOT NULL
                  OR t.category_minor_user IS NOT NULL
                  OR t.merchant <> t.description
                  OR t.cost_kind IS NOT NULL
                  OR t.fixed_cost_necessity IS NOT NULL
                  OR t.recurring_payment_kind IS NOT NULL
                  OR t.memo IS NOT NULL
                THEN TRUE
                ELSE FALSE
            END AS is_edited,
            t.source,
            t.created_at,
            t.updated_at
        FROM transactions t
        LEFT JOIN loan_transaction_links ltl ON ltl.transaction_id = t.id
        LEFT JOIN loan_accounts la ON la.id = ltl.loan_account_id
        WHERE t.is_deleted = FALSE
          AND t.merged_into_id IS NULL
        """
    )


def _recreate_transactions_effective_view() -> None:
    op.execute("DROP VIEW IF EXISTS vw_transactions_effective")
    op.execute(
        """
        CREATE VIEW vw_transactions_effective AS
        SELECT
            t.id,
            t.date,
            t.time,
            t.type,
            t.category_major,
            t.category_minor,
            t.category_major_user,
            t.category_minor_user,
            COALESCE(t.category_major_user, t.category_major) AS effective_category_major,
            COALESCE(t.category_minor_user, t.category_minor) AS effective_category_minor,
            t.description,
            t.merchant,
            t.amount,
            t.currency,
            t.payment_method,
            t.cost_kind,
            t.fixed_cost_necessity,
            t.cost_classification_source,
            t.recurring_payment_kind,
            t.memo,
            ltl.loan_account_id,
            la.lender AS loan_lender,
            la.product_name AS loan_product_name,
            ltl.repayment_type AS loan_repayment_type,
            ltl.memo AS loan_link_memo,
            t.is_deleted,
            t.merged_into_id,
            CASE
                WHEN t.category_major_user IS NOT NULL
                  OR t.category_minor_user IS NOT NULL
                  OR t.merchant <> t.description
                  OR t.cost_classification_source = 'manual'
                  OR t.recurring_payment_kind IS NOT NULL
                  OR t.memo IS NOT NULL
                THEN TRUE
                ELSE FALSE
            END AS is_edited,
            t.source,
            t.created_at,
            t.updated_at
        FROM transactions t
        LEFT JOIN loan_transaction_links ltl ON ltl.transaction_id = t.id
        LEFT JOIN loan_accounts la ON la.id = ltl.loan_account_id
        WHERE t.is_deleted = FALSE
          AND t.merged_into_id IS NULL
        """
    )
