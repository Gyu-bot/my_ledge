"""Occurrence-aware planner, independent of the legacy reservation algorithm."""

from collections import Counter
from dataclasses import asdict

from sqlalchemy import select

from app.models.transaction import Transaction
from app.schemas.upload_review import ReviewEntry
from app.services import upload_preview_change_builder as builder
from app.services import upload_preview_matching as matching


def source(row):
    return asdict(builder.source_from_row(row))


def stored_source(tx):
    return asdict(builder.source_from_transaction(tx))


def active_target(tx):
    return not (
        tx.is_deleted
        or tx.merged_into_id is not None
        or tx.superseded_by_transaction_id is not None
        or tx.source_lifecycle_status == "superseded"
    )


async def build_review_entries(db, rows):
    if not rows:
        return []
    start, end = min(r["date"] for r in rows), max(r["date"] for r in rows)
    existing = list(
        (
            await db.scalars(
                select(Transaction)
                .where(
                    Transaction.source == "import",
                    Transaction.date >= start,
                    Transaction.date <= end,
                )
                .order_by(Transaction.id)
                .execution_options(populate_existing=True)
            )
        ).all()
    )
    # Compare source values, not the legacy delimiter hash (None and '<null>' collide).
    signatures = Counter(tuple(source(r).values()) for r in rows)
    exact_buckets = {}
    for tx in existing:
        exact_buckets.setdefault(tuple(stored_source(tx).values()), []).append(tx)
    fallback_buckets = matching.build_fallback_buckets(existing)
    replacement_buckets = matching.build_replacement_buckets(existing)
    entries = []
    referenced = set()
    for row in rows:
        incoming = source(row)
        exact = exact_buckets.get(tuple(incoming.values()), [])
        fallback = matching.available_fallback_candidates(fallback_buckets, row, set())
        replacements = replacement_buckets.get(
            matching.replacement_signature_from_row(row), []
        )
        # Keep the full pre-reservation graph: no shared target becomes a false new.
        candidates = exact or fallback or replacements
        referenced.update(tx.id for tx in candidates)
        primary = candidates[0] if len(candidates) == 1 else None
        if signatures[tuple(incoming.values())] > 1 or len(exact) > 1:
            kind, reason = (
                "possible_duplicate",
                "Repeated source occurrence or multiple exact existing matches; explicit choice required.",
            )
        elif exact:
            kind, reason = "unchanged", "Exact typed source match."
        elif len(candidates) > 1:
            kind, reason = (
                "ambiguous",
                "Multiple existing candidates; no automatic mutation.",
            )
        elif fallback:
            changes = {delta.field for delta in builder.field_changes(primary, row)}
            kind = "time_shifted" if changes == {"time"} else "source_fields_changed"
            reason = "Unique fallback match within 60 seconds; source-managed update retains ID and user fields."
        elif replacements:
            kind, reason = (
                "possible_replacement",
                "Non-exact replacement candidate; explicit choice required.",
            )
        else:
            kind, reason = "new", "No existing imported source candidate."
        mutable = [tx for tx in candidates if active_target(tx)]
        action = "add" if kind == "new" else "keep"
        target = None
        if kind in ("source_fields_changed", "time_shifted") and primary in mutable:
            action, target = "update", primary.id
        entries.append(
            ReviewEntry(
                entry_id=str(len(entries) + 1),
                change_type=kind,
                reason=reason,
                existing_source=stored_source(primary) if primary else None,
                incoming_source=incoming,
                field_changes=[asdict(d) for d in builder.field_changes(primary, row)],
                candidates=[
                    {"transaction_id": tx.id, "source": stored_source(tx)}
                    for tx in candidates
                ],
                allowed_actions=["keep", "add"]
                + (["update"] if mutable and kind != "unchanged" else []),
                recommended_action=action,
                recommended_target_id=target,
            )
        )
    # Overlapping candidate graph downgrades defaults but never relabels classes.
    uses = Counter(c.transaction_id for e in entries for c in e.candidates)
    for entry in entries:
        if (
            any(uses[c.transaction_id] > 1 for c in entry.candidates)
            and entry.recommended_action != "keep"
        ):
            entry.recommended_action, entry.recommended_target_id = "keep", None
            entry.reason += " Shared candidate graph: default keep."
    for tx in existing:
        if tx.id not in referenced:
            entries.append(
                ReviewEntry(
                    entry_id=str(len(entries) + 1),
                    change_type="missing_from_latest_export",
                    reason="Absent in this export window; kept exactly unchanged, never deleted or retired.",
                    existing_source=stored_source(tx),
                    incoming_source=None,
                    field_changes=[],
                    candidates=[{"transaction_id": tx.id, "source": stored_source(tx)}],
                    allowed_actions=["keep"],
                    recommended_action="keep",
                    recommended_target_id=None,
                )
            )
    return entries
