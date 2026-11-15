"""metric contract views (T054) and amount-conservation basis (T055)

Creates the metric view layer (effective transactions -> monthly flow lines ->
monthly flow / spend cube) and rebuilds the legacy aggregate views on top of
``vw_metric_flow_lines`` so every surface shares one calculation path.

The metric view SQL below is a frozen PostgreSQL compile of
``app/services/metric_views.py``; ``tests/migrations/test_metric_views_migration.py``
fails if the two drift. No table is altered; the import contract is untouched.

Revision ID: 20261115_0035
Revises: 20261104_0034
Create Date: 2026-11-15 00:00:00
"""

import importlib.util
from collections.abc import Sequence
from pathlib import Path
from types import ModuleType

from alembic import op


revision: str = "20261115_0035"
down_revision: str | None = "20261104_0034"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None

METRIC_VIEW_SQL: tuple[tuple[str, str], ...] = (
    (
        "vw_metric_refund_allocations",
        """
SELECT settlement_matches.id AS settlement_match_id, settlement_matches.settlement_transaction_id AS refund_transaction_id, settlement_matches.original_transaction_id AS original_transaction_id, settlement_matches.matched_amount AS matched_amount, settlement_matches.status AS status
FROM settlement_matches JOIN transactions AS original_tx ON original_tx.id = settlement_matches.original_transaction_id JOIN transactions AS refund_tx ON refund_tx.id = settlement_matches.settlement_transaction_id
WHERE settlement_matches.status IN ('auto_confirmed', 'user_confirmed') AND settlement_matches.matched_amount > 0 AND original_tx.is_deleted = false AND original_tx.merged_into_id IS NULL AND original_tx.superseded_by_transaction_id IS NULL AND (original_tx.source_lifecycle_status IS NULL OR original_tx.source_lifecycle_status != 'superseded') AND refund_tx.is_deleted = false AND refund_tx.merged_into_id IS NULL AND refund_tx.superseded_by_transaction_id IS NULL AND (refund_tx.source_lifecycle_status IS NULL OR refund_tx.source_lifecycle_status != 'superseded') AND original_tx.type = '지출' AND original_tx.amount < 0 AND refund_tx.type = '지출' AND refund_tx.amount > 0 AND upper(original_tx.currency) = 'KRW' AND upper(refund_tx.currency) = 'KRW'
""",
    ),
    (
        "vw_metric_transactions",
        """
SELECT transactions.id AS id, transactions.date AS date, transactions.time AS time, to_char(transactions.date, 'YYYY-MM') AS period, transactions.type AS type, transactions.amount AS amount, transactions.currency AS currency, coalesce(transactions.category_major_user, transactions.category_major) AS effective_category_major, coalesce(transactions.category_minor_user, transactions.category_minor) AS effective_category_minor, transactions.merchant AS merchant, transactions.description AS description, transactions.payment_method AS payment_method, transactions.cost_kind AS cost_kind, transactions.fixed_cost_necessity AS fixed_cost_necessity, transactions.spend_necessity AS spend_necessity, transactions.recurring_payment_kind AS recurring_payment_kind, loan_transaction_links.loan_account_id AS loan_account_id, installment_transaction_links.installment_plan_id AS installment_plan_id, installment_transaction_links.installment_number AS installment_number, coalesce(received_refunds.total, 0) AS settlement_refund_total, coalesce(allocated_refunds.total, 0) AS settlement_allocated_total, CASE WHEN (transactions.type = '지출' AND transactions.amount < 0) THEN transactions.amount + coalesce(received_refunds.total, 0) WHEN (transactions.type = '지출' AND transactions.amount > 0) THEN transactions.amount - coalesce(allocated_refunds.total, 0) ELSE transactions.amount END AS purchase_net_amount
FROM transactions LEFT OUTER JOIN loan_transaction_links ON loan_transaction_links.transaction_id = transactions.id LEFT OUTER JOIN installment_transaction_links ON installment_transaction_links.transaction_id = transactions.id LEFT OUTER JOIN (SELECT vw_metric_refund_allocations.original_transaction_id AS transaction_id, sum(vw_metric_refund_allocations.matched_amount) AS total
FROM vw_metric_refund_allocations GROUP BY vw_metric_refund_allocations.original_transaction_id) AS received_refunds ON transactions.id = received_refunds.transaction_id LEFT OUTER JOIN (SELECT vw_metric_refund_allocations.refund_transaction_id AS transaction_id, sum(vw_metric_refund_allocations.matched_amount) AS total
FROM vw_metric_refund_allocations GROUP BY vw_metric_refund_allocations.refund_transaction_id) AS allocated_refunds ON transactions.id = allocated_refunds.transaction_id
WHERE transactions.is_deleted = false AND transactions.merged_into_id IS NULL AND transactions.superseded_by_transaction_id IS NULL AND (transactions.source_lifecycle_status IS NULL OR transactions.source_lifecycle_status != 'superseded')
""",
    ),
    (
        "vw_metric_flow_lines",
        """
SELECT axes.transaction_id, axes.attributed_transaction_id, axes.line_kind, axes.date, axes.time, axes.period, axes.type, axes.currency, axes.amount, axes.effective_category_major, axes.effective_category_minor, axes.merchant, axes.description, axes.payment_method, axes.cost_kind, axes.fixed_cost_necessity, axes.spend_necessity, axes.recurring_payment_kind, axes.loan_account_id, axes.installment_plan_id, axes.commitment_kind, CASE WHEN (axes.type != '지출') THEN 'not_applicable' WHEN (axes.commitment_kind IS NOT NULL) THEN 'committed' WHEN (axes.payment_form_conflict IS NOT NULL) THEN 'undetermined' ELSE 'ad_hoc' END AS payment_form, axes.adjustability, CASE WHEN (axes.type = '수입') THEN 'income' WHEN (axes.type = '이체') THEN 'transfer' WHEN (axes.type != '지출') THEN 'other' WHEN (axes.commitment_kind IS NOT NULL) THEN 'committed' WHEN (axes.payment_form_conflict IS NOT NULL) THEN 'undecided' WHEN (axes.adjustability = 'undecided') THEN 'undecided' ELSE 'ad_hoc' END AS flow_section, CASE WHEN (axes.type = '수입') THEN 'income_undetermined' WHEN (axes.type = '이체') THEN 'transfer_undetermined' WHEN (axes.type != '지출') THEN 'other_type' WHEN (axes.commitment_kind = 'loan') THEN 'committed_loan' WHEN (axes.commitment_kind = 'installment') THEN 'committed_installment' WHEN (axes.commitment_kind = 'recurring') THEN 'committed_recurring' WHEN (axes.payment_form_conflict IS NOT NULL) THEN 'undecided' WHEN (axes.adjustability = 'protected') THEN 'ad_hoc_protected' WHEN (axes.adjustability = 'adjustable') THEN 'ad_hoc_adjustable' ELSE 'undecided' END AS flow_row, CASE WHEN (axes.payment_form_conflict IS NOT NULL) THEN axes.payment_form_conflict WHEN (axes.adjustability = 'undecided' AND axes.necessity = 'necessity_conflict') THEN 'necessity_conflict' ELSE NULL END AS mapping_note
FROM (SELECT staged.transaction_id AS transaction_id, staged.attributed_transaction_id AS attributed_transaction_id, staged.line_kind AS line_kind, staged.date AS date, staged.time AS time, staged.period AS period, staged.type AS type, staged.currency AS currency, staged.amount AS amount, staged.effective_category_major AS effective_category_major, staged.effective_category_minor AS effective_category_minor, staged.merchant AS merchant, staged.description AS description, staged.payment_method AS payment_method, staged.cost_kind AS cost_kind, staged.fixed_cost_necessity AS fixed_cost_necessity, staged.spend_necessity AS spend_necessity, staged.recurring_payment_kind AS recurring_payment_kind, staged.loan_account_id AS loan_account_id, staged.installment_plan_id AS installment_plan_id, staged.payment_form_conflict AS payment_form_conflict, staged.necessity AS necessity, CASE WHEN (staged.type != '지출') THEN NULL WHEN (staged.loan_account_id IS NOT NULL) THEN 'loan' WHEN (staged.installment_plan_id IS NOT NULL) THEN 'installment' WHEN (staged.payment_form_conflict IS NOT NULL) THEN NULL WHEN (staged.cost_kind = 'fixed') THEN 'recurring' WHEN (staged.cost_kind IS NULL AND staged.recurring_payment_kind = 'monthly_recurring') THEN 'recurring' ELSE NULL END AS commitment_kind, CASE WHEN (staged.type != '지출') THEN 'not_applicable' WHEN (staged.loan_account_id IS NOT NULL OR staged.installment_plan_id IS NOT NULL) THEN 'protected' WHEN (staged.necessity = 'essential') THEN 'protected' WHEN (staged.necessity = 'discretionary') THEN 'adjustable' ELSE 'undecided' END AS adjustability
FROM (SELECT lines.transaction_id AS transaction_id, lines.attributed_transaction_id AS attributed_transaction_id, lines.line_kind AS line_kind, lines.date AS date, lines.time AS time, lines.period AS period, lines.type AS type, lines.currency AS currency, lines.amount AS amount, lines.effective_category_major AS effective_category_major, lines.effective_category_minor AS effective_category_minor, lines.merchant AS merchant, lines.description AS description, lines.payment_method AS payment_method, lines.cost_kind AS cost_kind, lines.fixed_cost_necessity AS fixed_cost_necessity, lines.spend_necessity AS spend_necessity, lines.recurring_payment_kind AS recurring_payment_kind, lines.loan_account_id AS loan_account_id, lines.installment_plan_id AS installment_plan_id, CASE WHEN (lines.type != '지출') THEN NULL WHEN (lines.loan_account_id IS NOT NULL OR lines.installment_plan_id IS NOT NULL) THEN NULL WHEN (lines.cost_kind = 'fixed' AND lines.recurring_payment_kind = 'not_recurring') THEN 'fixed_cost_marked_not_recurring' WHEN (lines.cost_kind = 'variable' AND lines.recurring_payment_kind = 'monthly_recurring') THEN 'variable_cost_marked_monthly_recurring' WHEN (lines.recurring_payment_kind = 'installment') THEN 'installment_kind_without_plan_link' ELSE NULL END AS payment_form_conflict, CASE WHEN (lines.cost_kind = 'fixed' AND lines.fixed_cost_necessity IS NOT NULL AND lines.spend_necessity IS NOT NULL AND lines.fixed_cost_necessity != lines.spend_necessity) THEN 'necessity_conflict' WHEN (lines.cost_kind = 'fixed') THEN coalesce(lines.fixed_cost_necessity, lines.spend_necessity) ELSE lines.spend_necessity END AS necessity
FROM (SELECT vw_metric_transactions.id AS transaction_id, vw_metric_transactions.id AS attributed_transaction_id, CASE WHEN (vw_metric_transactions.settlement_allocated_total > 0) THEN 'refund_remainder' ELSE 'transaction' END AS line_kind, vw_metric_transactions.date AS date, vw_metric_transactions.time AS time, vw_metric_transactions.period AS period, vw_metric_transactions.type AS type, vw_metric_transactions.currency AS currency, vw_metric_transactions.amount - vw_metric_transactions.settlement_allocated_total AS amount, vw_metric_transactions.effective_category_major AS effective_category_major, vw_metric_transactions.effective_category_minor AS effective_category_minor, vw_metric_transactions.merchant AS merchant, vw_metric_transactions.description AS description, vw_metric_transactions.payment_method AS payment_method, vw_metric_transactions.cost_kind AS cost_kind, vw_metric_transactions.fixed_cost_necessity AS fixed_cost_necessity, vw_metric_transactions.spend_necessity AS spend_necessity, vw_metric_transactions.recurring_payment_kind AS recurring_payment_kind, vw_metric_transactions.loan_account_id AS loan_account_id, vw_metric_transactions.installment_plan_id AS installment_plan_id
FROM vw_metric_transactions
WHERE upper(vw_metric_transactions.currency) = 'KRW' AND NOT (vw_metric_transactions.settlement_allocated_total > 0 AND vw_metric_transactions.amount = vw_metric_transactions.settlement_allocated_total) UNION ALL SELECT refund_tx.id AS transaction_id, original_tx.id AS attributed_transaction_id, 'refund_allocation' AS line_kind, refund_tx.date AS date, refund_tx.time AS time, refund_tx.period AS period, refund_tx.type AS type, refund_tx.currency AS currency, vw_metric_refund_allocations.matched_amount AS amount, original_tx.effective_category_major AS effective_category_major, original_tx.effective_category_minor AS effective_category_minor, original_tx.merchant AS merchant, original_tx.description AS description, original_tx.payment_method AS payment_method, original_tx.cost_kind AS cost_kind, original_tx.fixed_cost_necessity AS fixed_cost_necessity, original_tx.spend_necessity AS spend_necessity, original_tx.recurring_payment_kind AS recurring_payment_kind, original_tx.loan_account_id AS loan_account_id, original_tx.installment_plan_id AS installment_plan_id
FROM vw_metric_refund_allocations JOIN vw_metric_transactions AS refund_tx ON refund_tx.id = vw_metric_refund_allocations.refund_transaction_id JOIN vw_metric_transactions AS original_tx ON original_tx.id = vw_metric_refund_allocations.original_transaction_id) AS lines) AS staged) AS axes
""",
    ),
    (
        "vw_metric_as_of",
        """
SELECT bounds.first_transaction_date, bounds.transaction_as_of AS transaction_as_of, CASE WHEN (bounds.transaction_as_of IS NULL) THEN NULL ELSE to_char(CAST(date_trunc('month', CAST(CAST(bounds.transaction_as_of AS DATE) + 1 AS TIMESTAMP)) AS DATE) - 1, 'YYYY-MM') END AS last_closed_period, CASE WHEN (bounds.transaction_as_of IS NULL) THEN NULL WHEN (to_char(bounds.transaction_as_of, 'YYYY-MM') = to_char(CAST(date_trunc('month', CAST(CAST(bounds.transaction_as_of AS DATE) + 1 AS TIMESTAMP)) AS DATE) - 1, 'YYYY-MM')) THEN NULL ELSE to_char(bounds.transaction_as_of, 'YYYY-MM') END AS in_progress_period, (SELECT max(asset_snapshots.snapshot_date) AS max_1
FROM asset_snapshots) AS asset_snapshot_as_of, (SELECT max(loans.snapshot_date) AS max_2
FROM loans) AS loan_snapshot_as_of, (SELECT max(investments.snapshot_date) AS max_3
FROM investments) AS investment_snapshot_as_of, (SELECT max(insurance_contracts.snapshot_date) AS max_4
FROM insurance_contracts) AS insurance_snapshot_as_of, (SELECT max(user_profile_snapshots.snapshot_date) AS max_5
FROM user_profile_snapshots) AS profile_snapshot_as_of, (SELECT count(*) AS count_1
FROM vw_metric_transactions
WHERE upper(vw_metric_transactions.currency) != 'KRW') AS non_krw_transaction_count
FROM (SELECT min(vw_metric_transactions.date) AS first_transaction_date, max(vw_metric_transactions.date) AS transaction_as_of
FROM vw_metric_transactions) AS bounds
""",
    ),
    (
        "vw_monthly_flow",
        """
SELECT vw_metric_flow_lines.period, vw_metric_flow_lines.flow_section, vw_metric_flow_lines.flow_row, coalesce(sum(CASE WHEN (vw_metric_flow_lines.type = '지출') THEN -vw_metric_flow_lines.amount ELSE vw_metric_flow_lines.amount END), 0) AS amount, coalesce(sum(vw_metric_flow_lines.amount), 0) AS signed_amount, count(DISTINCT vw_metric_flow_lines.transaction_id) AS transaction_count
FROM vw_metric_flow_lines GROUP BY vw_metric_flow_lines.period, vw_metric_flow_lines.flow_section, vw_metric_flow_lines.flow_row
""",
    ),
    (
        "vw_monthly_flow_summary",
        """
SELECT monthly.period, monthly.income_total, monthly.committed_loan_total, monthly.committed_installment_total, monthly.committed_recurring_total, monthly.committed_total, monthly.ad_hoc_protected_total, monthly.ad_hoc_adjustable_total, monthly.undecided_total, monthly.total_outflow, monthly.living_spend, monthly.adjustable_spend, monthly.protected_spend, monthly.adjustability_undecided_total, monthly.residual, monthly.transfer_net, monthly.transfer_activity_total, monthly.other_type_total, monthly.refund_total, monthly.signed_total, monthly.transaction_count, CASE WHEN (monthly.period <= vw_metric_as_of.last_closed_period) THEN 'closed' ELSE 'in_progress' END AS month_status
FROM (SELECT vw_metric_flow_lines.period AS period, coalesce(sum(CASE WHEN (vw_metric_flow_lines.type = '수입') THEN vw_metric_flow_lines.amount ELSE 0 END), 0) AS income_total, coalesce(sum(CASE WHEN (vw_metric_flow_lines.type = '지출' AND vw_metric_flow_lines.flow_row = 'committed_loan') THEN -vw_metric_flow_lines.amount ELSE 0 END), 0) AS committed_loan_total, coalesce(sum(CASE WHEN (vw_metric_flow_lines.type = '지출' AND vw_metric_flow_lines.flow_row = 'committed_installment') THEN -vw_metric_flow_lines.amount ELSE 0 END), 0) AS committed_installment_total, coalesce(sum(CASE WHEN (vw_metric_flow_lines.type = '지출' AND vw_metric_flow_lines.flow_row = 'committed_recurring') THEN -vw_metric_flow_lines.amount ELSE 0 END), 0) AS committed_recurring_total, coalesce(sum(CASE WHEN (vw_metric_flow_lines.type = '지출' AND vw_metric_flow_lines.flow_section = 'committed') THEN -vw_metric_flow_lines.amount ELSE 0 END), 0) AS committed_total, coalesce(sum(CASE WHEN (vw_metric_flow_lines.type = '지출' AND vw_metric_flow_lines.flow_row = 'ad_hoc_protected') THEN -vw_metric_flow_lines.amount ELSE 0 END), 0) AS ad_hoc_protected_total, coalesce(sum(CASE WHEN (vw_metric_flow_lines.type = '지출' AND vw_metric_flow_lines.flow_row = 'ad_hoc_adjustable') THEN -vw_metric_flow_lines.amount ELSE 0 END), 0) AS ad_hoc_adjustable_total, coalesce(sum(CASE WHEN (vw_metric_flow_lines.type = '지출' AND vw_metric_flow_lines.flow_row = 'undecided') THEN -vw_metric_flow_lines.amount ELSE 0 END), 0) AS undecided_total, coalesce(sum(CASE WHEN (vw_metric_flow_lines.type = '지출') THEN -vw_metric_flow_lines.amount ELSE 0 END), 0) AS total_outflow, coalesce(sum(CASE WHEN (vw_metric_flow_lines.type = '지출') THEN -vw_metric_flow_lines.amount ELSE 0 END), 0) - coalesce(sum(CASE WHEN (vw_metric_flow_lines.type = '지출' AND vw_metric_flow_lines.flow_row = 'committed_loan') THEN -vw_metric_flow_lines.amount ELSE 0 END), 0) AS living_spend, coalesce(sum(CASE WHEN (vw_metric_flow_lines.type = '지출' AND vw_metric_flow_lines.adjustability = 'adjustable') THEN -vw_metric_flow_lines.amount ELSE 0 END), 0) AS adjustable_spend, coalesce(sum(CASE WHEN (vw_metric_flow_lines.type = '지출' AND vw_metric_flow_lines.adjustability = 'protected') THEN -vw_metric_flow_lines.amount ELSE 0 END), 0) AS protected_spend, coalesce(sum(CASE WHEN (vw_metric_flow_lines.type = '지출' AND vw_metric_flow_lines.adjustability = 'undecided') THEN -vw_metric_flow_lines.amount ELSE 0 END), 0) AS adjustability_undecided_total, coalesce(sum(CASE WHEN (vw_metric_flow_lines.type = '수입') THEN vw_metric_flow_lines.amount ELSE 0 END), 0) - coalesce(sum(CASE WHEN (vw_metric_flow_lines.type = '지출') THEN -vw_metric_flow_lines.amount ELSE 0 END), 0) AS residual, coalesce(sum(CASE WHEN (vw_metric_flow_lines.type = '이체') THEN vw_metric_flow_lines.amount ELSE 0 END), 0) AS transfer_net, coalesce(sum(CASE WHEN (vw_metric_flow_lines.type = '이체') THEN abs(vw_metric_flow_lines.amount) ELSE 0 END), 0) AS transfer_activity_total, coalesce(sum(CASE WHEN (vw_metric_flow_lines.flow_section = 'other') THEN vw_metric_flow_lines.amount ELSE 0 END), 0) AS other_type_total, coalesce(sum(CASE WHEN (vw_metric_flow_lines.type = '지출' AND vw_metric_flow_lines.amount > 0) THEN vw_metric_flow_lines.amount ELSE 0 END), 0) AS refund_total, coalesce(sum(vw_metric_flow_lines.amount), 0) AS signed_total, count(DISTINCT vw_metric_flow_lines.transaction_id) AS transaction_count
FROM vw_metric_flow_lines GROUP BY vw_metric_flow_lines.period) AS monthly JOIN vw_metric_as_of ON true
""",
    ),
    (
        "vw_spend_cube",
        """
SELECT vw_metric_flow_lines.period, vw_metric_flow_lines.effective_category_major, vw_metric_flow_lines.effective_category_minor, vw_metric_flow_lines.merchant, vw_metric_flow_lines.payment_form, vw_metric_flow_lines.commitment_kind, vw_metric_flow_lines.adjustability, vw_metric_flow_lines.flow_row, coalesce(sum(-vw_metric_flow_lines.amount), 0) AS amount, coalesce(sum(CASE WHEN (vw_metric_flow_lines.amount < 0) THEN -vw_metric_flow_lines.amount ELSE 0 END), 0) AS charge_total, coalesce(sum(CASE WHEN (vw_metric_flow_lines.amount > 0) THEN vw_metric_flow_lines.amount ELSE 0 END), 0) AS refund_total, count(DISTINCT vw_metric_flow_lines.transaction_id) AS transaction_count
FROM vw_metric_flow_lines
WHERE vw_metric_flow_lines.type = '지출' GROUP BY vw_metric_flow_lines.period, vw_metric_flow_lines.effective_category_major, vw_metric_flow_lines.effective_category_minor, vw_metric_flow_lines.merchant, vw_metric_flow_lines.payment_form, vw_metric_flow_lines.commitment_kind, vw_metric_flow_lines.adjustability, vw_metric_flow_lines.flow_row
""",
    ),
    (
        "vw_metric_excluded_currency",
        """
SELECT vw_metric_transactions.period, vw_metric_transactions.currency, vw_metric_transactions.type, coalesce(sum(vw_metric_transactions.amount), 0) AS signed_amount, count(*) AS transaction_count
FROM vw_metric_transactions
WHERE upper(vw_metric_transactions.currency) != 'KRW' GROUP BY vw_metric_transactions.period, vw_metric_transactions.currency, vw_metric_transactions.type
""",
    ),
)

# Legacy aggregate views keep their column names and types; only their source
# changes from vw_transactions_effective/transactions to vw_metric_flow_lines.
LEGACY_VIEW_SQL: tuple[tuple[str, str], ...] = (
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
        "vw_true_spendable_monthly",
        """
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
    (
        "vw_loan_repayment_monthly",
        """
SELECT
    l.period AS period,
    l.loan_account_id,
    t.loan_display_name,
    t.loan_lender,
    t.loan_product_name,
    t.loan_kind,
    t.loan_maturity_date,
    t.loan_repayment_type,
    COALESCE(SUM(-l.amount), 0)::integer AS repayment_total,
    COUNT(DISTINCT l.transaction_id)::integer AS transaction_count
FROM vw_metric_flow_lines l
LEFT JOIN vw_transactions_effective t ON t.id = l.attributed_transaction_id
WHERE l.type = '지출'
  AND l.loan_account_id IS NOT NULL
GROUP BY l.period, l.loan_account_id, t.loan_display_name, t.loan_lender, t.loan_product_name, t.loan_kind, t.loan_maturity_date, t.loan_repayment_type
""",
    ),
    (
        "vw_merchant_monthly_baseline",
        """
WITH monthly AS (
    SELECT
        date_trunc('month', t.date)::date AS period_month,
        t.period AS period,
        t.merchant,
        t.effective_category_major,
        t.effective_category_minor,
        COALESCE(SUM(-t.amount), 0)::integer AS monthly_spend,
        COUNT(DISTINCT t.transaction_id)::integer AS transaction_count
    FROM vw_metric_flow_lines t
    WHERE t.type = '지출'
      AND t.loan_account_id IS NULL
    GROUP BY date_trunc('month', t.date)::date, t.period, t.merchant, t.effective_category_major, t.effective_category_minor
),
with_baseline AS (
    SELECT
        monthly.*,
        COUNT(*) OVER baseline_window AS baseline_month_count,
        ROUND(AVG(monthly_spend) OVER baseline_window, 2) AS trailing_3_month_avg
    FROM monthly
    WINDOW baseline_window AS (
        PARTITION BY merchant, effective_category_major, effective_category_minor
        ORDER BY period_month
        ROWS BETWEEN 3 PRECEDING AND 1 PRECEDING
    )
)
SELECT
    period,
    merchant,
    effective_category_major,
    effective_category_minor,
    monthly_spend,
    transaction_count,
    baseline_month_count::integer AS baseline_month_count,
    trailing_3_month_avg,
    CASE WHEN trailing_3_month_avg IS NULL THEN NULL ELSE ROUND(monthly_spend - trailing_3_month_avg, 2) END AS baseline_delta,
    CASE WHEN trailing_3_month_avg IS NULL OR trailing_3_month_avg = 0 THEN NULL ELSE ROUND((monthly_spend - trailing_3_month_avg) / trailing_3_month_avg, 4) END AS baseline_delta_pct
FROM with_baseline
""",
    ),
    (
        "vw_recurring_merchant_monthly",
        """
SELECT
    t.period AS period,
    t.merchant,
    t.recurring_payment_kind,
    COALESCE(SUM(-t.amount), 0)::integer AS monthly_spend,
    COUNT(DISTINCT t.transaction_id)::integer AS transaction_count,
    MIN(t.date) AS first_date,
    MAX(t.date) AS last_date
FROM vw_metric_flow_lines t
WHERE t.type = '지출'
  AND t.loan_account_id IS NULL
  AND t.recurring_payment_kind IS NOT NULL
  AND t.recurring_payment_kind <> 'not_recurring'
GROUP BY t.period, t.merchant, t.recurring_payment_kind
""",
    ),
    (
        "vw_category_monthly_spend",
        """
SELECT
    t.period AS period,
    t.effective_category_major AS category_major,
    t.effective_category_minor AS category_minor,
    SUM(t.amount)::integer AS amount
FROM vw_metric_flow_lines t
WHERE t.type = '지출'
GROUP BY t.period, t.effective_category_major, t.effective_category_minor
""",
    ),
    (
        "vw_income_monthly_by_category",
        """
SELECT
    t.period AS period,
    COALESCE(t.effective_category_major, '미분류') AS effective_category_major,
    COALESCE(SUM(t.amount), 0)::integer AS income_total,
    COUNT(DISTINCT t.transaction_id)::integer AS transaction_count
FROM vw_metric_flow_lines t
WHERE t.type = '수입'
GROUP BY t.period, COALESCE(t.effective_category_major, '미분류')
""",
    ),
)

# vw_category_monthly_spend as last defined by revision 20260326_0002.
_CATEGORY_MONTHLY_SPEND_0002_SQL = """
CREATE VIEW vw_category_monthly_spend AS
SELECT
    to_char(date, 'YYYY-MM') AS period,
    COALESCE(category_major_user, category_major) AS category_major,
    COALESCE(category_minor_user, category_minor) AS category_minor,
    SUM(amount)::integer AS amount
FROM transactions
WHERE is_deleted = FALSE
  AND merged_into_id IS NULL
  AND type = '지출'
GROUP BY
    to_char(date, 'YYYY-MM'),
    COALESCE(category_major_user, category_major),
    COALESCE(category_minor_user, category_minor)
"""


def upgrade() -> None:
    _drop_views(name for name, _ in reversed(LEGACY_VIEW_SQL))
    for name, sql in METRIC_VIEW_SQL:
        op.execute(f"CREATE VIEW {name} AS {sql}")
    for name, sql in LEGACY_VIEW_SQL:
        op.execute(f"CREATE VIEW {name} AS {sql}")


def downgrade() -> None:
    _drop_views(name for name, _ in reversed(LEGACY_VIEW_SQL))
    _drop_views(name for name, _ in reversed(METRIC_VIEW_SQL))
    # Restore each legacy view exactly as its last defining revision left it.
    p1_surfaces = _load_revision("20260530_0019_p1_advisor_surfaces.py")
    p1_surfaces._create_fixed_cost_monthly_summary_view(include_spend_necessity=True)
    p1_surfaces._create_monthly_cashflow_view(include_spend_necessity=True)
    p1_surfaces._create_loan_repayment_monthly_view()
    p1_surfaces._create_true_spendable_monthly_view(include_spend_necessity=True)
    p1_surfaces._create_merchant_monthly_baseline_view()
    p1_surfaces._create_recurring_merchant_monthly_view()
    op.execute(_CATEGORY_MONTHLY_SPEND_0002_SQL)
    advisor_surfaces = _load_revision("20260611_0025_advisor_canonical_surfaces.py")
    advisor_surfaces._create_income_monthly_by_category_view()


def _drop_views(names) -> None:  # type: ignore[no-untyped-def]
    for name in names:
        op.execute(f"DROP VIEW IF EXISTS {name}")


def _load_revision(filename: str) -> ModuleType:
    path = Path(__file__).with_name(filename)
    spec = importlib.util.spec_from_file_location(f"_revision_{path.stem}", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load revision module {filename}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module
