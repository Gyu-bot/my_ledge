-- T056: every returned count must be zero before 20261117_0042.
-- Read-only; returns no identifiers, merchant/category names or financial values.
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
FROM state;
