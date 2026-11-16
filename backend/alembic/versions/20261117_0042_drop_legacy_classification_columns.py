"""T056: separately approved drop of frozen transaction classification columns.

Requires the views-only 0041 migration first. The counts-only preflight refuses
unrepresented legacy classification (including inactive rows and lineage).
No classification is inferred, suggested or automatically repaired here.
Prepared reviews become stale; old ready rollback points expire, retaining
snapshot evidence. Both use existing HTTP status/response contracts.

DATA LOSS: upgrade deletes the five legacy values. Downgrade recreates nullable
columns only; it cannot recover their data, removed indexes/constraints, or
reactivate old approvals/rollback points. Restore data from an approved backup
separately if needed. No CASCADE: unknown external view dependencies must fail.
"""

from alembic import context, op
import sqlalchemy as sa

revision = "20261117_0042"
down_revision = "20261117_0041"
branch_labels = None
depends_on = None

LEGACY_COLUMNS = (
    ("cost_kind", 20),
    ("fixed_cost_necessity", 20),
    ("spend_necessity", 20),
    ("cost_classification_source", 20),
    ("recurring_payment_kind", 30),
)

# Frozen counts-only query, also published in docs/agents/t056-drop-preflight.sql.
# It deliberately examines inactive rows too. Old values follow supersession /
# merge lineage to the surviving human classification; cycles refuse the drop.
PREFLIGHT_SQL = """
WITH RECURSIVE chain AS (
    SELECT id AS root_id, id AS target_id, ARRAY[id] AS path
    FROM transactions
    WHERE cost_kind IS NOT NULL OR fixed_cost_necessity IS NOT NULL
       OR spend_necessity IS NOT NULL OR recurring_payment_kind IS NOT NULL
       OR cost_classification_source = 'manual'
    UNION ALL
    SELECT c.root_id, COALESCE(t.superseded_by_transaction_id, t.merged_into_id),
           c.path || COALESCE(t.superseded_by_transaction_id, t.merged_into_id)
    FROM chain c JOIN transactions t ON t.id = c.target_id
    WHERE COALESCE(t.superseded_by_transaction_id, t.merged_into_id) IS NOT NULL
      AND NOT COALESCE(t.superseded_by_transaction_id, t.merged_into_id) = ANY(c.path)
), terminal AS (
    SELECT DISTINCT ON (root_id) root_id, target_id, path
    FROM chain ORDER BY root_id, cardinality(path) DESC
), state AS (
    SELECT old.type AS old_type, n.type AS target_type, old.cost_kind, old.fixed_cost_necessity,
           old.spend_necessity, old.recurring_payment_kind,
           old.cost_classification_source,
           COALESCE(n.superseded_by_transaction_id, n.merged_into_id) = ANY(z.path) AS lineage_cycle,
           ll.transaction_id IS NOT NULL OR il.transaction_id IS NOT NULL AS linked,
           o.source IN ('user', 'legacy_edit') AS newer_transaction_decision,
           o.installment_link_unconfirmed, o.necessity_conflict,
           r.id AS commitment_id, r.origin AS commitment_origin,
           r.cycle, r.amount_kind,
           COALESCE(o.adjustability, r.adjustability, d.adjustability, 'undecided') AS resolved_adjustability,
           r.origin = 'user' AND r.adjustability IS NOT NULL AS newer_commitment_adjustability,
           old.cost_kind = 'fixed' AND old.fixed_cost_necessity IS NOT NULL
             AND old.spend_necessity IS NOT NULL
             AND old.fixed_cost_necessity <> old.spend_necessity AS expected_conflict,
           CASE WHEN old.cost_kind = 'fixed'
                THEN COALESCE(old.fixed_cost_necessity, old.spend_necessity)
                ELSE old.spend_necessity END AS old_necessity,
           CASE WHEN old.recurring_payment_kind = 'installment' THEN FALSE
                WHEN old.cost_kind = 'fixed' AND old.recurring_payment_kind = 'not_recurring' THEN FALSE
                WHEN old.cost_kind = 'fixed' OR old.recurring_payment_kind = 'monthly_recurring' THEN TRUE
                ELSE FALSE END AS expected_recurring,
           old.cost_kind IS NOT NULL OR old.recurring_payment_kind IS NOT NULL AS payment_signal
    FROM terminal z
    JOIN transactions old ON old.id = z.root_id
    JOIN transactions n ON n.id = z.target_id
    LEFT JOIN transaction_nature_overrides o ON o.transaction_id = n.id
    LEFT JOIN loan_transaction_links ll ON ll.transaction_id = n.id
    LEFT JOIN installment_transaction_links il ON il.transaction_id = n.id
    LEFT JOIN LATERAL (
        SELECT c.* FROM recurring_commitments c
        WHERE NOT COALESCE(o.excluded_from_commitments, FALSE)
          AND (c.id = o.commitment_id OR (o.commitment_id IS NULL
            AND c.category_major = COALESCE(n.category_major_user, n.category_major)
            AND c.category_minor IS NOT DISTINCT FROM COALESCE(n.category_minor_user, n.category_minor)
            AND (c.match_scope = 'category' OR (c.match_scope = 'merchant' AND c.merchant = n.merchant))
            AND (c.start_date IS NULL OR c.start_date <= n.date)
            AND (c.end_date IS NULL OR c.end_date >= n.date)))
        ORDER BY CASE WHEN c.match_scope = 'merchant' THEN 0 ELSE 1 END, c.id
        LIMIT 1
    ) r ON TRUE
    LEFT JOIN LATERAL (
        SELECT c.adjustability FROM category_adjustability_defaults c
        WHERE c.category_major = COALESCE(n.category_major_user, n.category_major)
          AND (c.category_minor IS NOT DISTINCT FROM COALESCE(n.category_minor_user, n.category_minor)
               OR c.category_minor IS NULL)
        ORDER BY CASE WHEN c.category_minor IS NULL THEN 1 ELSE 0 END
        LIMIT 1
    ) d ON TRUE
)
SELECT
    COUNT(*) FILTER (WHERE cost_kind NOT IN ('fixed', 'variable')
        OR fixed_cost_necessity NOT IN ('essential', 'discretionary')
        OR spend_necessity NOT IN ('essential', 'discretionary')
        OR recurring_payment_kind NOT IN ('installment', 'monthly_recurring', 'not_recurring')
        OR (fixed_cost_necessity IS NOT NULL AND cost_kind IS DISTINCT FROM 'fixed')) AS unknown_value_count,
    COUNT(*) FILTER (WHERE lineage_cycle) AS lineage_cycle_count,
    COUNT(*) FILTER (WHERE (old_type <> '지출' OR target_type <> '지출') AND NOT COALESCE(newer_transaction_decision, FALSE)) AS non_expense_legacy_count,
    COUNT(*) FILTER (WHERE old_type = '지출' AND NOT linked
        AND NOT COALESCE(newer_transaction_decision, FALSE)
        AND commitment_origin IS DISTINCT FROM 'user'
        AND payment_signal AND expected_recurring <> (commitment_id IS NOT NULL)) AS payment_form_only_in_legacy_count,
    COUNT(*) FILTER (WHERE old_type = '지출' AND NOT linked
        AND NOT COALESCE(newer_transaction_decision, FALSE)
        AND NOT COALESCE(newer_commitment_adjustability, FALSE)
        AND NOT COALESCE(expected_conflict, FALSE) AND old_necessity IS NOT NULL
        AND resolved_adjustability IS DISTINCT FROM
            CASE old_necessity WHEN 'essential' THEN 'protected' WHEN 'discretionary' THEN 'adjustable' END) AS adjustability_only_in_legacy_count,
    COUNT(*) FILTER (WHERE old_type = '지출' AND NOT linked
        AND NOT COALESCE(newer_transaction_decision, FALSE)
        AND ((recurring_payment_kind = 'installment' AND NOT COALESCE(installment_link_unconfirmed, FALSE))
             OR (expected_conflict AND NOT COALESCE(necessity_conflict, FALSE)))) AS review_flag_only_in_legacy_count,
    COUNT(*) FILTER (WHERE old_type = '지출' AND NOT linked AND expected_recurring
        AND NOT COALESCE(newer_transaction_decision, FALSE)
        AND commitment_origin IS DISTINCT FROM 'user'
        AND commitment_id IS NOT NULL
        AND ((recurring_payment_kind = 'monthly_recurring' AND cycle IS DISTINCT FROM 'monthly')
             OR (cost_kind IS NOT NULL AND amount_kind IS DISTINCT FROM cost_kind))) AS commitment_attribute_only_in_legacy_count,
    COUNT(*) FILTER (WHERE cost_classification_source = 'manual'
        AND cost_kind IS NULL AND fixed_cost_necessity IS NULL
        AND spend_necessity IS NULL AND recurring_payment_kind IS NULL
        AND NOT COALESCE(newer_transaction_decision, FALSE)) AS provenance_only_in_legacy_count
FROM state
"""


def upgrade() -> None:
    if context.is_offline_mode():
        raise RuntimeError("T056 column drop requires an online counts-only preflight")
    connection = op.get_bind()
    # Same import/rollback advisory lock; fail promptly on an active writer.
    connection.execute(sa.text("SET LOCAL lock_timeout = '5s'"))
    connection.execute(sa.text("SELECT pg_advisory_xact_lock(7337291034)"))
    connection.execute(
        sa.text(
            "LOCK TABLE transactions, transaction_nature_overrides, recurring_commitments, "
            "category_adjustability_defaults, loan_transaction_links, installment_transaction_links, "
            "upload_review_operations, upload_rollback_points, upload_logs IN ACCESS EXCLUSIVE MODE"
        )
    )
    active = connection.scalar(
        sa.text(
            "SELECT (SELECT count(*) FROM upload_rollback_points WHERE status='pending') "
            "+ (SELECT count(*) FROM upload_logs WHERE status='processing')"
        )
    )
    if active:
        raise RuntimeError(
            "T056 column drop refused: imports are pending/processing; finish them first"
        )
    counts = dict(connection.execute(sa.text(PREFLIGHT_SQL)).mappings().one())
    if any(counts.values()):
        summary = ", ".join(
            f"{key}={int(value)}" for key, value in counts.items() if value
        )
        raise RuntimeError(
            "T056 column drop refused: classification exists only in legacy columns ("
            + summary
            + "). Preserve or explicitly resolve it in the new axes first; "
            "all counts in docs/agents/t056-drop-preflight.sql must be zero. No rows changed."
        )
    connection.execute(
        sa.text(
            "UPDATE upload_review_operations SET status='stale', "
            "payload=jsonb_set(payload::jsonb, '{status}', '\"stale\"'::jsonb, true)::json "
            "WHERE status='prepared'"
        )
    )
    connection.execute(
        sa.text(
            "UPDATE upload_rollback_points SET status='expired' WHERE status='ready'"
        )
    )
    for name, _ in LEGACY_COLUMNS:
        # PostgreSQL removes any local column index/constraint too. Unknown
        # external dependencies refuse this statement: deliberately no CASCADE.
        op.drop_column("transactions", name)


def downgrade() -> None:
    for name, length in LEGACY_COLUMNS:
        op.add_column("transactions", sa.Column(name, sa.String(length), nullable=True))
