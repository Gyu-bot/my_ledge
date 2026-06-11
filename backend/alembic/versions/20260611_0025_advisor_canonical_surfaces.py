"""add advisor canonical profile and loan income surfaces

Revision ID: 20260611_0025
Revises: 20260531_0024
Create Date: 2026-06-11 00:30:00.000000

"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "20260611_0025"
down_revision: str | None = "20260531_0024"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "purchase_gate_reviews",
        sa.Column("memo", sa.Text(), nullable=True),
    )
    op.add_column(
        "purchase_gate_reviews",
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "purchase_gate_reviews",
        sa.Column("cooldown_until", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_table(
        "user_profile_snapshots",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("snapshot_date", sa.Date(), nullable=False),
        sa.Column("gender", sa.String(length=20), nullable=True),
        sa.Column("age", sa.Integer(), nullable=True),
        sa.Column("credit_score_kcb", sa.Integer(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint("snapshot_date"),
    )
    op.create_table(
        "insurance_contracts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("snapshot_date", sa.Date(), nullable=False),
        sa.Column("insurer", sa.String(length=50), nullable=False),
        sa.Column("product_name", sa.String(length=200), nullable=False),
        sa.Column("contract_status", sa.String(length=30), nullable=True),
        sa.Column("total_paid", sa.Numeric(15, 2), nullable=True),
        sa.Column("contract_date", sa.Date(), nullable=True),
        sa.Column("maturity_date", sa.Date(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint("snapshot_date", "insurer", "product_name"),
    )
    _create_asset_snapshot_canonical_view()
    _create_loan_account_canonical_view()
    _create_income_monthly_by_category_view()


def downgrade() -> None:
    op.execute("DROP VIEW IF EXISTS vw_income_monthly_by_category")
    op.execute("DROP VIEW IF EXISTS vw_loan_account_canonical")
    op.execute("DROP VIEW IF EXISTS vw_asset_snapshot_canonical")
    op.drop_table("insurance_contracts")
    op.drop_table("user_profile_snapshots")
    op.drop_column("purchase_gate_reviews", "cooldown_until")
    op.drop_column("purchase_gate_reviews", "reviewed_at")
    op.drop_column("purchase_gate_reviews", "memo")


def _create_asset_snapshot_canonical_view() -> None:
    op.execute("DROP VIEW IF EXISTS vw_asset_snapshot_canonical")
    op.execute(
        """
        CREATE VIEW vw_asset_snapshot_canonical AS
        WITH asset_rows AS (
            SELECT
                snapshot_date,
                amount,
                side,
                CASE
                    WHEN side = 'asset' AND amount < 0 THEN amount
                    ELSE 0
                END AS negative_asset_excluded_amount,
                CASE
                    WHEN side = 'asset'
                     AND amount >= 0
                     AND (
                        is_cash_equivalent IS TRUE
                        OR liquidity_tier IN ('immediate', 'cash', 'cash_equivalent')
                        OR (
                            is_cash_equivalent IS NULL
                            AND liquidity_tier IS NULL
                            AND NOT (
                                category ILIKE '%부동산%'
                                OR category ILIKE '%전세%'
                                OR category ILIKE '%보증금%'
                                OR category ILIKE '%연금%'
                                OR category ILIKE '%보험%'
                                OR category ILIKE '%청약%'
                                OR category ILIKE '%저금통%'
                                OR product_name ILIKE '%부동산%'
                                OR product_name ILIKE '%전세%'
                                OR product_name ILIKE '%보증금%'
                                OR product_name ILIKE '%연금%'
                                OR product_name ILIKE '%보험%'
                                OR product_name ILIKE '%청약%'
                                OR product_name ILIKE '%저금통%'
                            )
                            AND (
                                category ILIKE '%현금%'
                                OR category ILIKE '%예금%'
                                OR category ILIKE '%자유입출금%'
                                OR category ILIKE '%전자금융%'
                                OR product_name ILIKE '%입출금%'
                                OR product_name ILIKE '%CMA%'
                                OR product_name ILIKE '%파킹%'
                                OR product_name ILIKE '%보통예금%'
                                OR product_name ILIKE '%통장%'
                            )
                        )
                     )
                    THEN amount
                    ELSE 0
                END AS cash_equivalent_amount,
                CASE
                    WHEN side = 'asset' AND amount >= 0 AND liquidity_tier = 'near_liquid'
                    THEN amount
                    ELSE 0
                END AS near_liquid_amount
            FROM asset_snapshots
        ),
        asset_by_date AS (
            SELECT
                snapshot_date,
                COALESCE(SUM(CASE WHEN side = 'asset' AND amount >= 0 THEN amount ELSE 0 END), 0) AS asset_total,
                COALESCE(SUM(CASE WHEN side = 'liability' THEN amount ELSE 0 END), 0) AS liability_total,
                COALESCE(SUM(negative_asset_excluded_amount), 0) AS negative_asset_excluded_total,
                COALESCE(SUM(cash_equivalent_amount), 0) AS cash_equivalent_total,
                COALESCE(SUM(near_liquid_amount), 0) AS near_liquid_total,
                COUNT(*)::integer AS asset_row_count
            FROM asset_rows
            GROUP BY snapshot_date
        ),
        loan_by_date AS (
            SELECT
                snapshot_date,
                COALESCE(SUM(balance), 0) AS loan_balance_total,
                COALESCE(SUM(monthly_payment), 0) AS monthly_debt_payment_total,
                COUNT(*)::integer AS loan_row_count
            FROM loans
            GROUP BY snapshot_date
        )
        SELECT
            a.snapshot_date,
            a.asset_total::numeric(15, 2) AS asset_total,
            a.liability_total::numeric(15, 2) AS liability_total,
            (a.asset_total - a.liability_total)::numeric(15, 2) AS net_worth,
            a.negative_asset_excluded_total::numeric(15, 2) AS negative_asset_excluded_total,
            a.cash_equivalent_total::numeric(15, 2) AS cash_equivalent_total,
            a.near_liquid_total::numeric(15, 2) AS near_liquid_total,
            GREATEST(
                a.asset_total - a.cash_equivalent_total - a.near_liquid_total,
                0
            )::numeric(15, 2) AS illiquid_total,
            COALESCE(l.loan_balance_total, 0)::numeric(15, 2) AS loan_balance_total,
            COALESCE(l.monthly_debt_payment_total, 0)::numeric(15, 2) AS monthly_debt_payment_total,
            a.asset_row_count,
            COALESCE(l.loan_row_count, 0)::integer AS loan_row_count
        FROM asset_by_date a
        LEFT JOIN loan_by_date l ON l.snapshot_date = a.snapshot_date
        """
    )


def _create_loan_account_canonical_view() -> None:
    op.execute("DROP VIEW IF EXISTS vw_loan_account_canonical")
    op.execute(
        """
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


def _create_income_monthly_by_category_view() -> None:
    op.execute("DROP VIEW IF EXISTS vw_income_monthly_by_category")
    op.execute(
        """
        CREATE VIEW vw_income_monthly_by_category AS
        SELECT
            TO_CHAR(date, 'YYYY-MM') AS period,
            COALESCE(category_major_user, category_major, '미분류') AS effective_category_major,
            COALESCE(SUM(amount), 0)::integer AS income_total,
            COUNT(*)::integer AS transaction_count
        FROM transactions
        WHERE is_deleted = false
          AND merged_into_id IS NULL
          AND type = '수입'
        GROUP BY TO_CHAR(date, 'YYYY-MM'), COALESCE(category_major_user, category_major, '미분류')
        """
    )
