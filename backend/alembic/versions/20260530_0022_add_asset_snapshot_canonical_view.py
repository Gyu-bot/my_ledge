"""add asset snapshot canonical view

Revision ID: 20260530_0022
Revises: 20260530_0021
Create Date: 2026-05-30 22:30:00.000000

"""

from collections.abc import Sequence

from alembic import op


revision: str = "20260530_0022"
down_revision: str | None = "20260530_0021"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    _create_asset_snapshot_canonical_view()


def downgrade() -> None:
    op.execute("DROP VIEW IF EXISTS vw_asset_snapshot_canonical")


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
                    WHEN side = 'asset'
                     AND (
                        is_cash_equivalent IS TRUE
                        OR liquidity_tier IN ('immediate', 'cash', 'cash_equivalent')
                        OR (
                            is_cash_equivalent IS NULL
                            AND liquidity_tier IS NULL
                            AND (
                                category ILIKE '%현금%'
                                OR category ILIKE '%예금%'
                                OR product_name ILIKE '%입출금%'
                                OR product_name ILIKE '%CMA%'
                                OR product_name ILIKE '%파킹%'
                                OR product_name ILIKE '%보통예금%'
                            )
                        )
                     )
                    THEN amount
                    ELSE 0
                END AS cash_equivalent_amount,
                CASE
                    WHEN side = 'asset' AND liquidity_tier = 'near_liquid' THEN amount
                    ELSE 0
                END AS near_liquid_amount
            FROM asset_snapshots
        ),
        asset_by_date AS (
            SELECT
                snapshot_date,
                COALESCE(SUM(CASE WHEN side = 'asset' THEN amount ELSE 0 END), 0) AS asset_total,
                COALESCE(SUM(CASE WHEN side = 'liability' THEN amount ELSE 0 END), 0) AS liability_total,
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
