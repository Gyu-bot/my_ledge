"""T054/T057: scoped expense aliases and closed-month cashflow ratios.

Views only. Existing columns keep their order and types. No table data changes.
Revision suffix is task-specific so the concurrent T062 migration can be ordered
by the reviewer without confusing the two changes.
"""

from collections.abc import Sequence

from alembic import op

revision: str = "20261117_t054_t057"
down_revision: str | None = "20261116_0039"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None

UPGRADE_VIEWS = (
    (
        "vw_monthly_cashflow",
        """
WITH monthly AS (
    SELECT
        t.period AS period,
        COALESCE(SUM(CASE WHEN t.type = '수입' THEN t.amount ELSE 0 END), 0)::integer AS income_total,
        COALESCE(SUM(CASE WHEN t.type = '지출' THEN -t.amount ELSE 0 END), 0)::integer AS expense_total,
        COALESCE(SUM(CASE WHEN t.type = '지출' AND t.loan_account_id IS NULL THEN -t.amount ELSE 0 END), 0)::integer AS non_loan_expense_total,
        COALESCE(SUM(CASE WHEN t.type = '이체' THEN ABS(t.amount) ELSE 0 END), 0)::integer AS transfer_activity_total,
        COALESCE(SUM(CASE WHEN t.type = '지출' AND t.loan_account_id IS NOT NULL THEN -t.amount ELSE 0 END), 0)::integer AS loan_repayment_total,
        COALESCE(SUM(CASE WHEN t.type = '지출' AND t.loan_account_id IS NULL AND t.cost_kind = 'fixed' THEN -t.amount ELSE 0 END), 0)::integer AS fixed_total,
        COALESCE(SUM(CASE WHEN t.type = '지출' AND t.loan_account_id IS NULL AND t.cost_kind = 'variable' THEN -t.amount ELSE 0 END), 0)::integer AS variable_total,
        COALESCE(SUM(CASE WHEN t.type = '지출' AND t.loan_account_id IS NULL AND t.cost_kind = 'fixed' AND t.fixed_cost_necessity = 'essential' THEN -t.amount ELSE 0 END), 0)::integer AS essential_fixed_total,
        COALESCE(SUM(CASE WHEN t.type = '지출' AND t.loan_account_id IS NULL AND t.cost_kind = 'fixed' AND t.fixed_cost_necessity = 'discretionary' THEN -t.amount ELSE 0 END), 0)::integer AS discretionary_fixed_total,
        COALESCE(SUM(CASE WHEN t.type = '지출' AND t.loan_account_id IS NULL AND t.cost_kind = 'variable' AND t.spend_necessity = 'essential' THEN -t.amount ELSE 0 END), 0)::integer AS essential_variable_total,
        COALESCE(SUM(CASE WHEN t.type = '지출' AND t.loan_account_id IS NULL AND t.cost_kind = 'variable' AND t.spend_necessity = 'discretionary' THEN -t.amount ELSE 0 END), 0)::integer AS discretionary_variable_total,
        COALESCE(SUM(CASE WHEN t.type = '지출' AND t.loan_account_id IS NULL AND t.cost_kind IS NULL THEN -t.amount ELSE 0 END), 0)::integer AS unclassified_expense_total
    FROM vw_metric_flow_lines t
    GROUP BY t.period
)
SELECT
    period,
    income_total,
    expense_total,
    non_loan_expense_total,
    transfer_activity_total,
    loan_repayment_total,
    fixed_total,
    variable_total,
    essential_fixed_total,
    discretionary_fixed_total,
    essential_variable_total,
    discretionary_variable_total,
    (essential_fixed_total + essential_variable_total)::integer AS required_spend_total,
    (discretionary_fixed_total + discretionary_variable_total)::integer AS discretionary_spend_total,
    unclassified_expense_total,
    (income_total - expense_total)::integer AS net_cashflow,
    CASE
        WHEN period > (SELECT last_closed_period FROM vw_metric_as_of) OR income_total = 0 THEN NULL
        ELSE ROUND((income_total - expense_total)::numeric / income_total, 4)
    END AS savings_rate,
    expense_total AS total_outflow,
    non_loan_expense_total AS living_spend
FROM monthly
""",
    ),
    (
        "vw_fixed_cost_monthly_summary",
        """
SELECT
    t.period AS period,
    COALESCE(SUM(-t.amount), 0)::integer AS expense_total,
    COALESCE(SUM(CASE WHEN t.cost_kind = 'fixed' THEN -t.amount ELSE 0 END), 0)::integer AS fixed_total,
    COALESCE(SUM(CASE WHEN t.cost_kind = 'variable' THEN -t.amount ELSE 0 END), 0)::integer AS variable_total,
    COALESCE(SUM(CASE WHEN t.cost_kind = 'fixed' AND t.fixed_cost_necessity = 'essential' THEN -t.amount ELSE 0 END), 0)::integer AS essential_fixed_total,
    COALESCE(SUM(CASE WHEN t.cost_kind = 'fixed' AND t.fixed_cost_necessity = 'discretionary' THEN -t.amount ELSE 0 END), 0)::integer AS discretionary_fixed_total,
    COALESCE(SUM(CASE WHEN t.cost_kind = 'variable' AND t.spend_necessity = 'essential' THEN -t.amount ELSE 0 END), 0)::integer AS essential_variable_total,
    COALESCE(SUM(CASE WHEN t.cost_kind = 'variable' AND t.spend_necessity = 'discretionary' THEN -t.amount ELSE 0 END), 0)::integer AS discretionary_variable_total,
    (
        COALESCE(SUM(CASE WHEN t.cost_kind = 'fixed' AND t.fixed_cost_necessity = 'essential' THEN -t.amount ELSE 0 END), 0)
        + COALESCE(SUM(CASE WHEN t.cost_kind = 'variable' AND t.spend_necessity = 'essential' THEN -t.amount ELSE 0 END), 0)
    )::integer AS required_spend_total,
    (
        COALESCE(SUM(CASE WHEN t.cost_kind = 'fixed' AND t.fixed_cost_necessity = 'discretionary' THEN -t.amount ELSE 0 END), 0)
        + COALESCE(SUM(CASE WHEN t.cost_kind = 'variable' AND t.spend_necessity = 'discretionary' THEN -t.amount ELSE 0 END), 0)
    )::integer AS discretionary_spend_total,
    COALESCE(SUM(CASE WHEN t.cost_kind IS NULL THEN -t.amount ELSE 0 END), 0)::integer AS unclassified_total,
    COUNT(DISTINCT CASE WHEN t.cost_kind IS NULL THEN t.transaction_id END)::integer AS unclassified_count,
    COALESCE(SUM(-t.amount), 0)::integer AS living_spend
FROM vw_metric_flow_lines t
WHERE t.type = '지출'
  AND t.loan_account_id IS NULL
GROUP BY t.period
""",
    ),
)

DOWNGRADE_VIEWS = (
    (
        "vw_monthly_cashflow",
        """
WITH monthly AS (
    SELECT
        t.period AS period,
        COALESCE(SUM(CASE WHEN t.type = '수입' THEN t.amount ELSE 0 END), 0)::integer AS income_total,
        COALESCE(SUM(CASE WHEN t.type = '지출' THEN -t.amount ELSE 0 END), 0)::integer AS expense_total,
        COALESCE(SUM(CASE WHEN t.type = '지출' AND t.loan_account_id IS NULL THEN -t.amount ELSE 0 END), 0)::integer AS non_loan_expense_total,
        COALESCE(SUM(CASE WHEN t.type = '이체' THEN ABS(t.amount) ELSE 0 END), 0)::integer AS transfer_activity_total,
        COALESCE(SUM(CASE WHEN t.type = '지출' AND t.loan_account_id IS NOT NULL THEN -t.amount ELSE 0 END), 0)::integer AS loan_repayment_total,
        COALESCE(SUM(CASE WHEN t.type = '지출' AND t.loan_account_id IS NULL AND t.cost_kind = 'fixed' THEN -t.amount ELSE 0 END), 0)::integer AS fixed_total,
        COALESCE(SUM(CASE WHEN t.type = '지출' AND t.loan_account_id IS NULL AND t.cost_kind = 'variable' THEN -t.amount ELSE 0 END), 0)::integer AS variable_total,
        COALESCE(SUM(CASE WHEN t.type = '지출' AND t.loan_account_id IS NULL AND t.cost_kind = 'fixed' AND t.fixed_cost_necessity = 'essential' THEN -t.amount ELSE 0 END), 0)::integer AS essential_fixed_total,
        COALESCE(SUM(CASE WHEN t.type = '지출' AND t.loan_account_id IS NULL AND t.cost_kind = 'fixed' AND t.fixed_cost_necessity = 'discretionary' THEN -t.amount ELSE 0 END), 0)::integer AS discretionary_fixed_total,
        COALESCE(SUM(CASE WHEN t.type = '지출' AND t.loan_account_id IS NULL AND t.cost_kind = 'variable' AND t.spend_necessity = 'essential' THEN -t.amount ELSE 0 END), 0)::integer AS essential_variable_total,
        COALESCE(SUM(CASE WHEN t.type = '지출' AND t.loan_account_id IS NULL AND t.cost_kind = 'variable' AND t.spend_necessity = 'discretionary' THEN -t.amount ELSE 0 END), 0)::integer AS discretionary_variable_total,
        COALESCE(SUM(CASE WHEN t.type = '지출' AND t.loan_account_id IS NULL AND t.cost_kind IS NULL THEN -t.amount ELSE 0 END), 0)::integer AS unclassified_expense_total
    FROM vw_metric_flow_lines t
    GROUP BY t.period
)
SELECT
    period,
    income_total,
    expense_total,
    non_loan_expense_total,
    transfer_activity_total,
    loan_repayment_total,
    fixed_total,
    variable_total,
    essential_fixed_total,
    discretionary_fixed_total,
    essential_variable_total,
    discretionary_variable_total,
    (essential_fixed_total + essential_variable_total)::integer AS required_spend_total,
    (discretionary_fixed_total + discretionary_variable_total)::integer AS discretionary_spend_total,
    unclassified_expense_total,
    (income_total - expense_total)::integer AS net_cashflow,
    CASE
        WHEN income_total = 0 THEN NULL
        ELSE ROUND((income_total - expense_total)::numeric / income_total, 4)
    END AS savings_rate
FROM monthly
""",
    ),
    (
        "vw_fixed_cost_monthly_summary",
        """
SELECT
    t.period AS period,
    COALESCE(SUM(-t.amount), 0)::integer AS expense_total,
    COALESCE(SUM(CASE WHEN t.cost_kind = 'fixed' THEN -t.amount ELSE 0 END), 0)::integer AS fixed_total,
    COALESCE(SUM(CASE WHEN t.cost_kind = 'variable' THEN -t.amount ELSE 0 END), 0)::integer AS variable_total,
    COALESCE(SUM(CASE WHEN t.cost_kind = 'fixed' AND t.fixed_cost_necessity = 'essential' THEN -t.amount ELSE 0 END), 0)::integer AS essential_fixed_total,
    COALESCE(SUM(CASE WHEN t.cost_kind = 'fixed' AND t.fixed_cost_necessity = 'discretionary' THEN -t.amount ELSE 0 END), 0)::integer AS discretionary_fixed_total,
    COALESCE(SUM(CASE WHEN t.cost_kind = 'variable' AND t.spend_necessity = 'essential' THEN -t.amount ELSE 0 END), 0)::integer AS essential_variable_total,
    COALESCE(SUM(CASE WHEN t.cost_kind = 'variable' AND t.spend_necessity = 'discretionary' THEN -t.amount ELSE 0 END), 0)::integer AS discretionary_variable_total,
    (
        COALESCE(SUM(CASE WHEN t.cost_kind = 'fixed' AND t.fixed_cost_necessity = 'essential' THEN -t.amount ELSE 0 END), 0)
        + COALESCE(SUM(CASE WHEN t.cost_kind = 'variable' AND t.spend_necessity = 'essential' THEN -t.amount ELSE 0 END), 0)
    )::integer AS required_spend_total,
    (
        COALESCE(SUM(CASE WHEN t.cost_kind = 'fixed' AND t.fixed_cost_necessity = 'discretionary' THEN -t.amount ELSE 0 END), 0)
        + COALESCE(SUM(CASE WHEN t.cost_kind = 'variable' AND t.spend_necessity = 'discretionary' THEN -t.amount ELSE 0 END), 0)
    )::integer AS discretionary_spend_total,
    COALESCE(SUM(CASE WHEN t.cost_kind IS NULL THEN -t.amount ELSE 0 END), 0)::integer AS unclassified_total,
    COUNT(DISTINCT CASE WHEN t.cost_kind IS NULL THEN t.transaction_id END)::integer AS unclassified_count
FROM vw_metric_flow_lines t
WHERE t.type = '지출'
  AND t.loan_account_id IS NULL
GROUP BY t.period
""",
    ),
)

TRUE_SPENDABLE_SQL = """
SELECT
    period,
    income_total,
    loan_repayment_total,
    fixed_total AS fixed_commitment_total,
    variable_total,
    essential_variable_total AS required_variable_total, discretionary_variable_total,
    (income_total - loan_repayment_total - fixed_total)::integer AS spendable_before_variable_spend,
    (income_total - loan_repayment_total - fixed_total - variable_total)::integer AS remaining_after_variable_spend
FROM vw_monthly_cashflow
"""


def upgrade() -> None:
    for name, sql in UPGRADE_VIEWS:
        op.execute(f"CREATE OR REPLACE VIEW {name} AS {sql}")


def downgrade() -> None:
    op.execute("DROP VIEW vw_true_spendable_monthly")
    for name, _ in reversed(UPGRADE_VIEWS):
        op.execute(f"DROP VIEW {name}")
    for name, sql in DOWNGRADE_VIEWS:
        op.execute(f"CREATE VIEW {name} AS {sql}")
    op.execute(f"CREATE VIEW vw_true_spendable_monthly AS {TRUE_SPENDABLE_SQL}")
