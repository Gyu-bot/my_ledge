"""migrate existing human classification to the two axes (T056 backfill)

Maps every non-merged, non-superseded 지출 transaction (deleted rows included,
because they can be restored) from the old columns to the T056 tables with the
mapping the user approved on 2026-11-15:

- loan link -> committed (loan) · protected; installment-plan link ->
  committed (installment) · protected (both fixed by the view).
- cost_kind=fixed (+ monthly/empty kind), cost_kind=variable +
  monthly_recurring, and monthly_recurring without cost_kind -> committed
  (recurring payment). These rows are grouped by merchant + effective category
  and registered as one ``recurring_commitments`` bundle per group
  (origin='migration', match_scope='merchant', start_date = earliest member,
  no end). cycle='monthly' only when every member was monthly_recurring;
  amount_kind='fixed'/'variable' only when every member agrees; the bundle's
  adjustability is set only when every member's mapped value agrees.
- recurring_payment_kind=installment without a plan link -> ad hoc, flagged
  installment_link_unconfirmed. cost_kind=fixed + not_recurring -> ad hoc.
  cost_kind=variable -> ad hoc. Ad hoc rows whose merchant/category key has a
  bundle are excluded from it so they stay ad hoc.
- Adjustability: essential -> protected, discretionary -> adjustable, empty ->
  undecided; for cost_kind=fixed fixed_cost_necessity first, then
  spend_necessity, and a disagreement stays undecided (necessity_conflict).
  A bundle member stores no transaction-level value when it equals the
  bundle's value, so later edits of the bundle apply to it.

Idempotent: bundles are matched by key among origin='migration' rows and
override rows use ON CONFLICT DO NOTHING, so a re-run creates no duplicates.
The mapping below is a frozen copy of ``app/services/nature_axes_mapping.py``;
``tests/services/test_nature_axes_mapping.py`` checks they agree on every input.
The old columns are only read, never changed.

Revision ID: 20261115_0037
Revises: 20261115_0036
Create Date: 2026-11-15 00:00:00
"""

from collections import defaultdict
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20261115_0037"
down_revision: str | None = "20261115_0036"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None

_NECESSITY = {"essential": "protected", "discretionary": "adjustable"}


def map_legacy(
    *,
    loan_linked: bool,
    installment_linked: bool,
    cost_kind: str | None,
    fixed_cost_necessity: str | None,
    spend_necessity: str | None,
    recurring_payment_kind: str | None,
) -> tuple[str, str | None, str | None, bool, bool]:
    """(mapping_row, commitment_kind, adjustability, link_unconfirmed, conflict)."""
    kind = cost_kind if cost_kind in ("fixed", "variable") else None
    fixed_n = (
        fixed_cost_necessity
        if fixed_cost_necessity in ("essential", "discretionary")
        else None
    )
    spend_n = (
        spend_necessity if spend_necessity in ("essential", "discretionary") else None
    )
    recurring = (
        recurring_payment_kind
        if recurring_payment_kind
        in ("monthly_recurring", "installment", "not_recurring")
        else None
    )
    conflict = False
    if kind == "fixed":
        if fixed_n is not None and spend_n is not None and fixed_n != spend_n:
            conflict, necessity = True, None
        else:
            necessity = fixed_n or spend_n
    else:
        necessity = spend_n
    adjust = _NECESSITY.get(necessity or "")

    def out(row, commitment, unconfirmed=False):  # type: ignore[no-untyped-def]
        return row, commitment, adjust, unconfirmed, conflict

    if loan_linked:
        return out("loan_linked", "loan")
    if installment_linked:
        return out("installment_linked", "installment")
    if recurring == "installment":
        return out("installment_kind_unlinked", None, True)
    if kind == "fixed":
        if recurring == "not_recurring":
            return out("fixed_not_recurring", None)
        if conflict:
            return out("fixed_necessity_conflict", "recurring")
        return out(
            {"protected": "fixed_essential", "adjustable": "fixed_discretionary"}.get(
                adjust or "", "fixed_necessity_empty"
            ),
            "recurring",
        )
    if kind == "variable":
        if recurring == "monthly_recurring":
            return out("variable_monthly_recurring", "recurring")
        return out(
            {
                "protected": "variable_essential",
                "adjustable": "variable_discretionary",
            }.get(adjust or "", "variable_necessity_empty"),
            None,
        )
    if recurring == "monthly_recurring":
        return out("monthly_recurring_no_cost_kind", "recurring")
    if adjust is not None:
        return out("no_cost_kind_with_necessity", None)
    return out("unclassified", None)


_SOURCE_ROWS = sa.text(
    """
    SELECT t.id, t.date, t.merchant,
           COALESCE(t.category_major_user, t.category_major) AS category_major,
           COALESCE(t.category_minor_user, t.category_minor) AS category_minor,
           t.cost_kind, t.fixed_cost_necessity, t.spend_necessity,
           t.recurring_payment_kind,
           EXISTS (SELECT 1 FROM loan_transaction_links l
                   WHERE l.transaction_id = t.id) AS loan_linked,
           EXISTS (SELECT 1 FROM installment_transaction_links i
                   WHERE i.transaction_id = t.id) AS installment_linked
    FROM transactions t
    WHERE t.type = '지출'
      AND t.merged_into_id IS NULL
      AND t.superseded_by_transaction_id IS NULL
      AND (t.source_lifecycle_status IS NULL
           OR t.source_lifecycle_status != 'superseded')
    ORDER BY t.date, t.id
    """
)


def backfill(connection: sa.engine.Connection) -> dict[str, int]:
    rows = connection.execute(_SOURCE_ROWS).mappings().all()
    mapped = []
    groups: dict[tuple[str, str, str | None], list] = defaultdict(list)
    for row in rows:
        result = map_legacy(
            loan_linked=bool(row["loan_linked"]),
            installment_linked=bool(row["installment_linked"]),
            cost_kind=row["cost_kind"],
            fixed_cost_necessity=row["fixed_cost_necessity"],
            spend_necessity=row["spend_necessity"],
            recurring_payment_kind=row["recurring_payment_kind"],
        )
        key = (row["merchant"], row["category_major"], row["category_minor"])
        mapped.append((row, key, result))
        if result[1] == "recurring":
            groups[key].append((row, result))

    bundles: dict[tuple[str, str, str | None], tuple[int, str | None]] = {}
    created = 0
    for key in sorted(groups, key=lambda k: (k[1], k[2] or "", k[0])):
        members = groups[key]
        adjustments = {result[2] for _, result in members}
        adjustability = adjustments.pop() if len(adjustments) == 1 else None
        merchant, major, minor = key
        existing = connection.execute(
            sa.text(
                "SELECT id FROM recurring_commitments WHERE origin = 'migration' "
                "AND match_scope = 'merchant' AND merchant = :merchant "
                "AND category_major = :major "
                "AND category_minor IS NOT DISTINCT FROM :minor "
                "ORDER BY id LIMIT 1"
            ),
            {"merchant": merchant, "major": major, "minor": minor},
        ).scalar()
        if existing is None:
            kinds = {row["cost_kind"] for row, _ in members}
            recurring = {row["recurring_payment_kind"] for row, _ in members}
            existing = connection.execute(
                sa.text(
                    "INSERT INTO recurring_commitments (match_scope, merchant, "
                    "category_major, category_minor, cycle, amount_kind, "
                    "adjustability, start_date, origin) VALUES ('merchant', "
                    ":merchant, :major, :minor, :cycle, :amount_kind, "
                    ":adjustability, :start_date, 'migration') RETURNING id"
                ),
                {
                    "merchant": merchant,
                    "major": major,
                    "minor": minor,
                    "cycle": "monthly" if recurring == {"monthly_recurring"} else None,
                    "amount_kind": kinds.pop()
                    if len(kinds) == 1 and kinds <= {"fixed", "variable"}
                    else None,
                    "adjustability": adjustability,
                    "start_date": min(row["date"] for row, _ in members),
                },
            ).scalar_one()
            created += 1
            bundles[key] = (int(existing), adjustability)
        else:
            stored = connection.execute(
                sa.text(
                    "SELECT adjustability FROM recurring_commitments WHERE id = :id"
                ),
                {"id": existing},
            ).scalar()
            bundles[key] = (int(existing), stored)

    overrides = []
    for row, key, (_, commitment, adjust, unconfirmed, conflict) in mapped:
        excluded = False
        stored_adjust = adjust
        if commitment == "recurring":
            if adjust == bundles[key][1]:
                stored_adjust = None
        elif commitment is None:
            excluded = key in bundles
        if stored_adjust is None and not (excluded or unconfirmed or conflict):
            continue
        overrides.append(
            {
                "transaction_id": row["id"],
                "adjustability": stored_adjust,
                "excluded": excluded,
                "unconfirmed": unconfirmed,
                "conflict": conflict,
            }
        )
    if overrides:
        connection.execute(
            sa.text(
                "INSERT INTO transaction_nature_overrides (transaction_id, "
                "adjustability, commitment_id, excluded_from_commitments, "
                "installment_link_unconfirmed, necessity_conflict, source) VALUES "
                "(:transaction_id, :adjustability, NULL, :excluded, :unconfirmed, "
                ":conflict, 'migration') ON CONFLICT (transaction_id) DO NOTHING"
            ),
            overrides,
        )
    return {
        "source_rows": len(rows),
        "bundles_created": created,
        "bundles_total": len(bundles),
        "override_rows": len(overrides),
    }


def upgrade() -> None:
    backfill(op.get_bind())


def downgrade() -> None:
    op.execute("DELETE FROM transaction_nature_overrides WHERE source = 'migration'")
    op.execute("DELETE FROM recurring_commitments WHERE origin = 'migration'")
