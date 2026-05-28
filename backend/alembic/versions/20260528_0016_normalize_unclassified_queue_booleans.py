"""normalize unclassified queue booleans

Revision ID: 20260528_0016
Revises: 20260528_0015
Create Date: 2026-05-28 22:45:00.000000
"""

from collections.abc import Sequence

from alembic import op

revision: str = "20260528_0016"
down_revision: str | None = "20260528_0015"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _create_unclassified_work_queue_view(*, normalize_booleans: bool) -> None:
    needs_cost_kind = "COALESCE(transaction_rows.cost_kind IS NULL, FALSE)"
    needs_fixed_cost_necessity = """
                COALESCE((
                    transaction_rows.cost_kind = 'fixed'
                    AND transaction_rows.fixed_cost_necessity IS NULL
                ), FALSE)
    """
    needs_recurring_payment_kind = """
                COALESCE((
                    transaction_rows.recurring_payment_kind IS NULL
                    AND (
                        transaction_rows.cost_kind = 'fixed'
                        OR transaction_rows.merchant_expense_count >= 2
                    )
                ), FALSE)
    """
    needs_loan_link_review = """
                COALESCE((
                    transaction_rows.effective_category_major = '금융'
                    OR COALESCE(transaction_rows.effective_category_minor, '') ILIKE '%대출%'
                    OR COALESCE(transaction_rows.effective_category_minor, '') ILIKE '%상환%'
                    OR COALESCE(transaction_rows.effective_category_minor, '') ILIKE '%이자%'
                    OR transaction_rows.description ILIKE '%대출%'
                    OR transaction_rows.description ILIKE '%상환%'
                    OR transaction_rows.description ILIKE '%이자%'
                    OR transaction_rows.description ILIKE '%원리금%'
                    OR transaction_rows.description ILIKE '%원금·이자%'
                    OR transaction_rows.description ILIKE '%원금 이자%'
                    OR transaction_rows.merchant ILIKE '%대출%'
                    OR transaction_rows.merchant ILIKE '%상환%'
                    OR transaction_rows.merchant ILIKE '%이자%'
                    OR COALESCE(transaction_rows.payment_method, '') ILIKE '%대출%'
                    OR COALESCE(transaction_rows.payment_method, '') ILIKE '%상환%'
                    OR COALESCE(transaction_rows.payment_method, '') ILIKE '%이자%'
                ), FALSE)
    """
    if not normalize_booleans:
        needs_cost_kind = "(transaction_rows.cost_kind IS NULL)"
        needs_fixed_cost_necessity = """
                (
                    transaction_rows.cost_kind = 'fixed'
                    AND transaction_rows.fixed_cost_necessity IS NULL
                )
        """
        needs_recurring_payment_kind = """
                (
                    transaction_rows.recurring_payment_kind IS NULL
                    AND (
                        transaction_rows.cost_kind = 'fixed'
                        OR transaction_rows.merchant_expense_count >= 2
                    )
                )
        """
        needs_loan_link_review = """
                (
                    transaction_rows.effective_category_major = '금융'
                    OR COALESCE(transaction_rows.effective_category_minor, '') ILIKE '%대출%'
                    OR COALESCE(transaction_rows.effective_category_minor, '') ILIKE '%상환%'
                    OR COALESCE(transaction_rows.effective_category_minor, '') ILIKE '%이자%'
                    OR transaction_rows.description ILIKE '%대출%'
                    OR transaction_rows.description ILIKE '%상환%'
                    OR transaction_rows.description ILIKE '%이자%'
                    OR transaction_rows.description ILIKE '%원리금%'
                    OR transaction_rows.description ILIKE '%원금·이자%'
                    OR transaction_rows.description ILIKE '%원금 이자%'
                    OR transaction_rows.merchant ILIKE '%대출%'
                    OR transaction_rows.merchant ILIKE '%상환%'
                    OR transaction_rows.merchant ILIKE '%이자%'
                    OR COALESCE(transaction_rows.payment_method, '') ILIKE '%대출%'
                    OR COALESCE(transaction_rows.payment_method, '') ILIKE '%상환%'
                    OR COALESCE(transaction_rows.payment_method, '') ILIKE '%이자%'
                )
        """

    op.execute(
        f"""
        CREATE OR REPLACE VIEW vw_unclassified_work_queue AS
        WITH expense_rows AS (
            SELECT
                t.*,
                ABS(t.amount)::integer AS amount_abs,
                COUNT(*) OVER (PARTITION BY t.merchant)::integer AS merchant_expense_count
            FROM vw_transactions_effective t
            WHERE t.type = '지출'
              AND t.loan_account_id IS NULL
        ),
        classified AS (
            SELECT
                transaction_rows.*,
                {needs_cost_kind} AS needs_cost_kind,
                {needs_fixed_cost_necessity} AS needs_fixed_cost_necessity,
                {needs_recurring_payment_kind} AS needs_recurring_payment_kind,
                {needs_loan_link_review} AS needs_loan_link_review
            FROM expense_rows transaction_rows
        )
        SELECT
            id AS transaction_id,
            date,
            type,
            merchant,
            effective_category_major,
            effective_category_minor,
            amount,
            amount_abs,
            needs_cost_kind,
            needs_fixed_cost_necessity,
            needs_recurring_payment_kind,
            needs_loan_link_review,
            merchant_expense_count,
            (
                LEAST(amount_abs, 1000000)
                + CASE WHEN needs_loan_link_review THEN 50000 ELSE 0 END
                + CASE WHEN needs_cost_kind THEN 30000 ELSE 0 END
                + CASE WHEN needs_fixed_cost_necessity THEN 20000 ELSE 0 END
                + CASE WHEN needs_recurring_payment_kind THEN 10000 ELSE 0 END
                + CASE WHEN merchant_expense_count >= 2 THEN 5000 ELSE 0 END
            )::integer AS priority_score,
            CASE
                WHEN needs_loan_link_review THEN 'loan_link_review'
                WHEN needs_cost_kind THEN 'missing_cost_kind'
                WHEN needs_fixed_cost_necessity THEN 'missing_fixed_necessity'
                WHEN needs_recurring_payment_kind THEN 'missing_recurring_kind'
                ELSE 'review'
            END AS priority_reason
        FROM classified
        WHERE needs_cost_kind
           OR needs_fixed_cost_necessity
           OR needs_recurring_payment_kind
           OR needs_loan_link_review
        """
    )


def upgrade() -> None:
    _create_unclassified_work_queue_view(normalize_booleans=True)


def downgrade() -> None:
    _create_unclassified_work_queue_view(normalize_booleans=False)
