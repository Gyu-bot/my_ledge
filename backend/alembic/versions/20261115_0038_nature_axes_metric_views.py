"""metric views read the two-axis nature (T056)

Adds ``vw_transaction_nature`` and recreates the metric view layer so the
monthly flow, spend cube and comparison read payment form and adjustability
from the T056 tables instead of the old classification columns. The legacy
aggregate views are recreated unchanged from 0035 (they still break down the
old ``cost_kind``/necessity columns that ``vw_metric_flow_lines`` carries).
``vw_unclassified_work_queue`` keeps its columns; it now lists 지출 whose
resolved adjustability is undecided (or that need a loan-link review), never
asks the per-transaction recurring kind, and skips superseded and
installment-linked rows.

The metric view SQL below is a frozen PostgreSQL compile of
``app/services/metric_views.py``; ``tests/migrations/test_metric_views_migration.py``
fails if the two drift. Downgrade restores the 0035 metric/legacy views and the
0019 work-queue view exactly. No table is altered.

Revision ID: 20261115_0038
Revises: 20261115_0037
Create Date: 2026-11-15 00:00:00
"""

import importlib.util
from collections.abc import Sequence
from pathlib import Path
from types import ModuleType

from alembic import op


revision: str = "20261115_0038"
down_revision: str | None = "20261115_0037"
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
        "vw_transaction_nature",
        """
SELECT nature_staged.transaction_id, nature_staged.type, nature_staged.date, nature_staged.period, nature_staged.effective_category_major, nature_staged.effective_category_minor, nature_staged.merchant, nature_staged.loan_account_id, nature_staged.installment_plan_id, nature_staged.recurring_commitment_id, nature_staged.commitment_match, CASE WHEN (nature_staged.type != '지출') THEN NULL WHEN (nature_staged.loan_account_id IS NOT NULL) THEN 'loan' WHEN (nature_staged.installment_plan_id IS NOT NULL) THEN 'installment' WHEN (nature_staged.recurring_commitment_id IS NOT NULL) THEN 'recurring' ELSE NULL END AS commitment_kind, CASE WHEN (nature_staged.type != '지출') THEN 'not_applicable' WHEN (CASE WHEN (nature_staged.type != '지출') THEN NULL WHEN (nature_staged.loan_account_id IS NOT NULL) THEN 'loan' WHEN (nature_staged.installment_plan_id IS NOT NULL) THEN 'installment' WHEN (nature_staged.recurring_commitment_id IS NOT NULL) THEN 'recurring' ELSE NULL END IS NOT NULL) THEN 'committed' ELSE 'ad_hoc' END AS payment_form, nature_staged.transaction_adjustability, CASE WHEN (nature_staged.recurring_commitment_id IS NULL) THEN NULL ELSE member_commitment.adjustability END AS commitment_adjustability, nature_staged.category_default_adjustability, CASE WHEN (nature_staged.type != '지출') THEN 'not_applicable' WHEN (nature_staged.loan_account_id IS NOT NULL) THEN 'protected' WHEN (nature_staged.installment_plan_id IS NOT NULL) THEN 'protected' ELSE coalesce(nature_staged.transaction_adjustability, CASE WHEN (nature_staged.recurring_commitment_id IS NULL) THEN NULL ELSE member_commitment.adjustability END, nature_staged.category_default_adjustability, 'undecided') END AS adjustability, CASE WHEN (nature_staged.type != '지출') THEN 'not_applicable' WHEN (nature_staged.loan_account_id IS NOT NULL) THEN 'fixed_loan' WHEN (nature_staged.installment_plan_id IS NOT NULL) THEN 'fixed_installment' WHEN (nature_staged.transaction_adjustability IS NOT NULL) THEN 'transaction' WHEN (CASE WHEN (nature_staged.recurring_commitment_id IS NULL) THEN NULL ELSE member_commitment.adjustability END IS NOT NULL) THEN 'commitment' WHEN (nature_staged.category_default_adjustability IS NOT NULL) THEN 'category_default' ELSE 'none' END AS adjustability_source, nature_staged.excluded_from_commitments, CASE WHEN (nature_staged.type = '지출' AND nature_staged.installment_plan_id IS NULL AND nature_staged.installment_link_flag = true) THEN true ELSE false END AS installment_link_unconfirmed, nature_staged.necessity_conflict 
FROM (SELECT nature_base.transaction_id AS transaction_id, nature_base.type AS type, nature_base.date AS date, nature_base.period AS period, nature_base.effective_category_major AS effective_category_major, nature_base.effective_category_minor AS effective_category_minor, nature_base.merchant AS merchant, nature_base.loan_account_id AS loan_account_id, nature_base.installment_plan_id AS installment_plan_id, nature_base.transaction_adjustability AS transaction_adjustability, nature_base.explicit_commitment_id AS explicit_commitment_id, nature_base.excluded_from_commitments AS excluded_from_commitments, nature_base.installment_link_flag AS installment_link_flag, nature_base.necessity_conflict AS necessity_conflict, nature_base.rule_commitment_id AS rule_commitment_id, nature_base.category_default_adjustability AS category_default_adjustability, CASE WHEN (nature_base.type != '지출' OR nature_base.loan_account_id IS NOT NULL OR nature_base.installment_plan_id IS NOT NULL OR nature_base.excluded_from_commitments = true) THEN NULL ELSE coalesce(nature_base.explicit_commitment_id, nature_base.rule_commitment_id) END AS recurring_commitment_id, CASE WHEN (nature_base.type != '지출' OR nature_base.loan_account_id IS NOT NULL OR nature_base.installment_plan_id IS NOT NULL OR nature_base.excluded_from_commitments = true) THEN NULL WHEN (nature_base.explicit_commitment_id IS NOT NULL) THEN 'explicit' WHEN (nature_base.rule_commitment_id IS NOT NULL) THEN 'rule' ELSE NULL END AS commitment_match 
FROM (SELECT vw_metric_transactions.id AS transaction_id, vw_metric_transactions.type AS type, vw_metric_transactions.date AS date, vw_metric_transactions.period AS period, vw_metric_transactions.effective_category_major AS effective_category_major, vw_metric_transactions.effective_category_minor AS effective_category_minor, vw_metric_transactions.merchant AS merchant, vw_metric_transactions.loan_account_id AS loan_account_id, vw_metric_transactions.installment_plan_id AS installment_plan_id, transaction_nature_overrides.adjustability AS transaction_adjustability, transaction_nature_overrides.commitment_id AS explicit_commitment_id, coalesce(transaction_nature_overrides.excluded_from_commitments, false) AS excluded_from_commitments, coalesce(transaction_nature_overrides.installment_link_unconfirmed, false) AS installment_link_flag, coalesce(transaction_nature_overrides.necessity_conflict, false) AS necessity_conflict, (SELECT rule_commitment.id 
FROM recurring_commitments AS rule_commitment 
WHERE rule_commitment.category_major = vw_metric_transactions.effective_category_major AND rule_commitment.category_minor IS NOT DISTINCT FROM vw_metric_transactions.effective_category_minor AND (rule_commitment.match_scope = 'category' OR rule_commitment.match_scope = 'merchant' AND rule_commitment.merchant = vw_metric_transactions.merchant) AND (rule_commitment.start_date IS NULL OR rule_commitment.start_date <= vw_metric_transactions.date) AND (rule_commitment.end_date IS NULL OR rule_commitment.end_date >= vw_metric_transactions.date) ORDER BY CASE WHEN (rule_commitment.match_scope = 'merchant') THEN 0 ELSE 1 END, rule_commitment.id 
 LIMIT 1) AS rule_commitment_id, (SELECT category_default.adjustability 
FROM category_adjustability_defaults AS category_default 
WHERE category_default.category_major = vw_metric_transactions.effective_category_major AND (category_default.category_minor IS NOT DISTINCT FROM vw_metric_transactions.effective_category_minor OR category_default.category_minor IS NULL) ORDER BY CASE WHEN (category_default.category_minor IS NULL) THEN 1 ELSE 0 END 
 LIMIT 1) AS category_default_adjustability 
FROM vw_metric_transactions LEFT OUTER JOIN transaction_nature_overrides ON transaction_nature_overrides.transaction_id = vw_metric_transactions.id) AS nature_base) AS nature_staged LEFT OUTER JOIN recurring_commitments AS member_commitment ON member_commitment.id = nature_staged.recurring_commitment_id
""",
    ),
    (
        "vw_metric_flow_lines",
        """
SELECT axes.transaction_id, axes.attributed_transaction_id, axes.line_kind, axes.date, axes.time, axes.period, axes.type, axes.currency, axes.amount, axes.effective_category_major, axes.effective_category_minor, axes.merchant, axes.description, axes.payment_method, axes.cost_kind, axes.fixed_cost_necessity, axes.spend_necessity, axes.recurring_payment_kind, axes.loan_account_id, axes.installment_plan_id, axes.commitment_kind, CASE WHEN (axes.type != '지출') THEN 'not_applicable' WHEN (axes.commitment_kind IS NOT NULL) THEN 'committed' ELSE 'ad_hoc' END AS payment_form, axes.adjustability, CASE WHEN (axes.type = '수입') THEN 'income' WHEN (axes.type = '이체') THEN 'transfer' WHEN (axes.type != '지출') THEN 'other' WHEN (axes.commitment_kind IS NOT NULL) THEN 'committed' WHEN (axes.adjustability IN ('protected', 'adjustable')) THEN 'ad_hoc' ELSE 'undecided' END AS flow_section, CASE WHEN (axes.type = '수입') THEN 'income_undetermined' WHEN (axes.type = '이체') THEN 'transfer_undetermined' WHEN (axes.type != '지출') THEN 'other_type' WHEN (axes.commitment_kind = 'loan') THEN 'committed_loan' WHEN (axes.commitment_kind = 'installment') THEN 'committed_installment' WHEN (axes.commitment_kind = 'recurring') THEN 'committed_recurring' WHEN (axes.adjustability = 'protected') THEN 'ad_hoc_protected' WHEN (axes.adjustability = 'adjustable') THEN 'ad_hoc_adjustable' ELSE 'undecided' END AS flow_row, axes.mapping_note, axes.recurring_commitment_id, axes.adjustability_source 
FROM (SELECT lines.transaction_id AS transaction_id, lines.attributed_transaction_id AS attributed_transaction_id, lines.line_kind AS line_kind, lines.date AS date, lines.time AS time, lines.period AS period, lines.type AS type, lines.currency AS currency, lines.amount AS amount, lines.effective_category_major AS effective_category_major, lines.effective_category_minor AS effective_category_minor, lines.merchant AS merchant, lines.description AS description, lines.payment_method AS payment_method, lines.cost_kind AS cost_kind, lines.fixed_cost_necessity AS fixed_cost_necessity, lines.spend_necessity AS spend_necessity, lines.recurring_payment_kind AS recurring_payment_kind, lines.loan_account_id AS loan_account_id, lines.installment_plan_id AS installment_plan_id, CASE WHEN (lines.type != '지출') THEN NULL ELSE vw_transaction_nature.commitment_kind END AS commitment_kind, CASE WHEN (lines.type != '지출') THEN 'not_applicable' ELSE coalesce(vw_transaction_nature.adjustability, 'undecided') END AS adjustability, CASE WHEN (lines.type != '지출') THEN 'not_applicable' ELSE coalesce(vw_transaction_nature.adjustability_source, 'none') END AS adjustability_source, CASE WHEN (lines.type != '지출') THEN NULL ELSE vw_transaction_nature.recurring_commitment_id END AS recurring_commitment_id, CASE WHEN (lines.type != '지출') THEN NULL WHEN (vw_transaction_nature.installment_link_unconfirmed = true) THEN 'installment_link_unconfirmed' WHEN (vw_transaction_nature.necessity_conflict = true AND coalesce(vw_transaction_nature.adjustability, 'undecided') = 'undecided') THEN 'necessity_conflict' ELSE NULL END AS mapping_note 
FROM (SELECT vw_metric_transactions.id AS transaction_id, vw_metric_transactions.id AS attributed_transaction_id, CASE WHEN (vw_metric_transactions.settlement_allocated_total > 0) THEN 'refund_remainder' ELSE 'transaction' END AS line_kind, vw_metric_transactions.date AS date, vw_metric_transactions.time AS time, vw_metric_transactions.period AS period, vw_metric_transactions.type AS type, vw_metric_transactions.currency AS currency, vw_metric_transactions.amount - vw_metric_transactions.settlement_allocated_total AS amount, vw_metric_transactions.effective_category_major AS effective_category_major, vw_metric_transactions.effective_category_minor AS effective_category_minor, vw_metric_transactions.merchant AS merchant, vw_metric_transactions.description AS description, vw_metric_transactions.payment_method AS payment_method, vw_metric_transactions.cost_kind AS cost_kind, vw_metric_transactions.fixed_cost_necessity AS fixed_cost_necessity, vw_metric_transactions.spend_necessity AS spend_necessity, vw_metric_transactions.recurring_payment_kind AS recurring_payment_kind, vw_metric_transactions.loan_account_id AS loan_account_id, vw_metric_transactions.installment_plan_id AS installment_plan_id 
FROM vw_metric_transactions 
WHERE upper(vw_metric_transactions.currency) = 'KRW' AND NOT (vw_metric_transactions.settlement_allocated_total > 0 AND vw_metric_transactions.amount = vw_metric_transactions.settlement_allocated_total) UNION ALL SELECT refund_tx.id AS transaction_id, original_tx.id AS attributed_transaction_id, 'refund_allocation' AS line_kind, refund_tx.date AS date, refund_tx.time AS time, refund_tx.period AS period, refund_tx.type AS type, refund_tx.currency AS currency, vw_metric_refund_allocations.matched_amount AS amount, original_tx.effective_category_major AS effective_category_major, original_tx.effective_category_minor AS effective_category_minor, original_tx.merchant AS merchant, original_tx.description AS description, original_tx.payment_method AS payment_method, original_tx.cost_kind AS cost_kind, original_tx.fixed_cost_necessity AS fixed_cost_necessity, original_tx.spend_necessity AS spend_necessity, original_tx.recurring_payment_kind AS recurring_payment_kind, original_tx.loan_account_id AS loan_account_id, original_tx.installment_plan_id AS installment_plan_id 
FROM vw_metric_refund_allocations JOIN vw_metric_transactions AS refund_tx ON refund_tx.id = vw_metric_refund_allocations.refund_transaction_id JOIN vw_metric_transactions AS original_tx ON original_tx.id = vw_metric_refund_allocations.original_transaction_id) AS lines LEFT OUTER JOIN vw_transaction_nature ON vw_transaction_nature.transaction_id = lines.attributed_transaction_id) AS axes
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

UNCLASSIFIED_WORK_QUEUE_SQL = """
WITH expense_rows AS (
    SELECT
        t.*,
        ABS(t.amount)::integer AS amount_abs,
        COUNT(*) OVER (PARTITION BY t.merchant)::integer AS merchant_expense_count,
        n.adjustability AS resolved_adjustability
    FROM vw_transactions_effective t
    JOIN vw_transaction_nature n ON n.transaction_id = t.id
    WHERE t.type = '지출'
      AND t.loan_account_id IS NULL
      AND n.installment_plan_id IS NULL
),
classified AS (
    SELECT
        transaction_rows.*,
        COALESCE((transaction_rows.resolved_adjustability = 'undecided' AND transaction_rows.cost_kind IS NULL), FALSE) AS needs_cost_kind,
        COALESCE((transaction_rows.resolved_adjustability = 'undecided' AND transaction_rows.cost_kind = 'fixed'), FALSE) AS needs_fixed_cost_necessity,
        COALESCE((transaction_rows.resolved_adjustability = 'undecided'), FALSE) AS needs_spend_necessity,
        FALSE AS needs_recurring_payment_kind,
        COALESCE((
            transaction_rows.effective_category_major = '금융'
            OR COALESCE(transaction_rows.effective_category_minor, '') ILIKE '%대출%'
            OR COALESCE(transaction_rows.effective_category_minor, '') ILIKE '%상환%'
            OR transaction_rows.description ILIKE '%대출%'
            OR transaction_rows.description ILIKE '%상환%'
            OR transaction_rows.merchant ILIKE '%대출%'
            OR transaction_rows.merchant ILIKE '%상환%'
        ), FALSE) AS needs_loan_link_review
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
    needs_spend_necessity,
    needs_recurring_payment_kind,
    needs_loan_link_review,
    merchant_expense_count,
    (
        LEAST(amount_abs, 1000000)
        + CASE WHEN needs_loan_link_review THEN 50000 ELSE 0 END
        + CASE WHEN needs_cost_kind THEN 30000 ELSE 0 END
        + CASE WHEN needs_fixed_cost_necessity THEN 20000 ELSE 0 END
        + CASE WHEN needs_spend_necessity THEN 20000 ELSE 0 END
        + CASE WHEN needs_recurring_payment_kind THEN 10000 ELSE 0 END
        + CASE WHEN merchant_expense_count >= 2 THEN 5000 ELSE 0 END
    )::integer AS priority_score,
    CASE
        WHEN needs_loan_link_review THEN 'loan_link_review'
        WHEN needs_cost_kind THEN 'missing_cost_kind'
        WHEN needs_fixed_cost_necessity THEN 'missing_fixed_necessity'
        WHEN needs_spend_necessity THEN 'missing_spend_necessity'
        WHEN needs_recurring_payment_kind THEN 'missing_recurring_kind'
        ELSE 'review'
    END AS priority_reason
FROM classified
WHERE needs_cost_kind
   OR needs_fixed_cost_necessity
   OR needs_spend_necessity
   OR needs_loan_link_review
"""


def upgrade() -> None:
    previous = _load_revision("20261115_0035_metric_contract_views.py")
    op.execute("DROP VIEW IF EXISTS vw_unclassified_work_queue")
    _drop_views(name for name, _ in reversed(previous.LEGACY_VIEW_SQL))
    _drop_views(name for name, _ in reversed(previous.METRIC_VIEW_SQL))
    for name, sql in METRIC_VIEW_SQL:
        op.execute(f"CREATE VIEW {name} AS {sql}")
    for name, sql in previous.LEGACY_VIEW_SQL:
        op.execute(f"CREATE VIEW {name} AS {sql}")
    op.execute(
        f"CREATE VIEW vw_unclassified_work_queue AS {UNCLASSIFIED_WORK_QUEUE_SQL}"
    )


def downgrade() -> None:
    previous = _load_revision("20261115_0035_metric_contract_views.py")
    op.execute("DROP VIEW IF EXISTS vw_unclassified_work_queue")
    _drop_views(name for name, _ in reversed(previous.LEGACY_VIEW_SQL))
    _drop_views(name for name, _ in reversed(METRIC_VIEW_SQL))
    for name, sql in previous.METRIC_VIEW_SQL:
        op.execute(f"CREATE VIEW {name} AS {sql}")
    for name, sql in previous.LEGACY_VIEW_SQL:
        op.execute(f"CREATE VIEW {name} AS {sql}")
    p1_surfaces = _load_revision("20260530_0019_p1_advisor_surfaces.py")
    p1_surfaces._create_unclassified_work_queue_view(include_spend_necessity=True)


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
