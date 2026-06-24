"""add loan account hidden flag

Revision ID: 20260624_0026
Revises: 20260611_0025
Create Date: 2026-06-24 00:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "20260624_0026"
down_revision: str | None = "20260611_0025"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "loan_accounts",
        sa.Column(
            "is_hidden",
            sa.Boolean(),
            server_default=sa.false(),
            nullable=False,
        ),
    )
    _create_loan_account_canonical_view(include_hidden=True)


def downgrade() -> None:
    _create_loan_account_canonical_view(include_hidden=False)
    op.drop_column("loan_accounts", "is_hidden")


def _create_loan_account_canonical_view(*, include_hidden: bool) -> None:
    op.execute("DROP VIEW IF EXISTS vw_loan_account_canonical")
    hidden_column = (
        "COALESCE(la.is_hidden, false) AS is_hidden," if include_hidden else ""
    )
    op.execute(
        f"""
        CREATE VIEW vw_loan_account_canonical AS
        WITH latest_loan_date AS (
            SELECT lender, product_name, MAX(snapshot_date) AS snapshot_date
            FROM loans
            GROUP BY lender, product_name
        )
        SELECT
            la.id AS loan_account_id,
            COALESCE(
                la.display_name_user,
                l.lender || ' ' || l.product_name
            ) AS display_name,
            l.lender,
            l.product_name,
            la.loan_kind,
            {hidden_column}
            l.snapshot_date,
            l.principal,
            l.balance,
            l.interest_rate,
            l.monthly_payment,
            l.monthly_payment_source,
            l.repayment_method,
            l.start_date,
            l.maturity_date,
            CASE
                WHEN l.balance IS NULL OR l.interest_rate IS NULL THEN NULL
                ELSE ROUND(l.balance * l.interest_rate / 100 / 12)
            END::numeric(15, 2) AS estimated_monthly_interest
        FROM loans l
        JOIN latest_loan_date d
          ON d.lender = l.lender
         AND d.product_name = l.product_name
         AND d.snapshot_date = l.snapshot_date
        LEFT JOIN loan_accounts la
          ON la.lender = l.lender
         AND la.product_name = l.product_name
        """
    )
