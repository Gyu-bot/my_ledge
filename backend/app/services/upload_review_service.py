"""Transactional reviewed imports. Never log private plans or approval wording.

All registered finance tables are locked/digested, including metadata and links.
This intentionally over-invalidates plans. API keys authenticate the caller only;
canonical human-message provenance must be verified by the finance helper.
"""

from collections import Counter
from dataclasses import asdict
from datetime import date, datetime, time
from decimal import Decimal
from hashlib import sha256
import json
from pathlib import Path
from uuid import uuid4

from sqlalchemy import func, select, text, update

from app.models import Base
from app.models.transaction import Transaction, TransactionSourceLifecycleStatus
from app.models.upload_log import UploadLog
from app.models.upload_review_operation import UploadReviewOperation
from app.models.user_profile_snapshot import UserProfileSnapshot
from app.parsers.snapshots import SnapshotParseResult
from app.schemas.upload import UploadPreviewChangeCounts, UploadPreviewSourceRow
from app.schemas.upload_review import (
    ReviewApplyRequest,
    ReviewDecision,
    ReviewResponse,
    ReviewRevision,
)
from app.services.loan_mapping_service import (
    apply_loan_repayment_estimates_for_latest_snapshots,
    project_loan_repayment_estimates,
)
from app.services.transaction_source_identity import source_row_hash_from_row
from app.services.transaction_source_lifecycle_service import (
    LifecycleTouch,
    apply_source_managed_row_update,
    build_imported_transaction,
    touch_transaction_source_lifecycle,
)
from app.services.upload_preview_service import parse_upload_workbook_contents
from app.services.upload_review_planner import active_target, build_review_entries
from app.services.upload_service import (
    SNAPSHOT_MODELS,
    normalize_snapshots_for_storage,
    persist_original_upload,
    replace_snapshots,
    snapshot_replacement_rows,
    snapshot_semantic_fields,
    snapshot_semantic_row,
)


class ReviewError(ValueError):
    def __init__(self, code, message, status_code=409):
        self.code, self.message, self.status_code = code, message, status_code
        super().__init__(message)


def canonical(value):
    """Typed JSON: no null sentinel, delimiter, decimal, or datetime collisions."""
    if isinstance(value, (datetime, date, time, Decimal, bytes)):
        return {
            "$type": type(value).__name__,
            "$value": (
                value.hex()
                if isinstance(value, bytes)
                else str(value.normalize())
                if isinstance(value, Decimal)
                else str(value)
            ),
        }
    if isinstance(value, dict):
        return {str(k): canonical(v) for k, v in value.items()}
    if isinstance(value, (tuple, list)):
        return [canonical(v) for v in value]
    return value


def encoded(value):
    return json.dumps(
        canonical(value),
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    )


def digest(value):
    return sha256(encoded(value).encode()).hexdigest()


def review_binding(file_hash, snapshot_date, context, rows, snapshots):
    # Bind interpretation as well as bytes: parser/normalizer upgrades may change
    # same-count snapshot values, raw evidence, or even explicitly kept rows.
    # Reuse the durable internal binding column; no public schema change.
    return digest(
        {
            "file": file_hash,
            "date": snapshot_date,
            "context": context.model_dump(mode="json"),
            "parsed": {
                "rows": rows,
                "snapshots": asdict(snapshots),
                "normalized_snapshots": asdict(
                    normalize_snapshots_for_storage(snapshots)
                ),
            },
        }
    )


def finance_tables():
    return sorted(
        (
            t
            for t in Base.metadata.tables.values()
            if t.name != "upload_review_operations"
        ),
        key=lambda t: t.name,
    )


async def lock_state(db):
    # Fixed sorted set/order matches digest scope. Regular writers' ROW EXCLUSIVE
    # locks conflict too; readers and canonical timeout GET are not blocked.
    if db.bind.dialect.name == "postgresql":
        await db.execute(text("SET LOCAL lock_timeout = '5s'"))
        names = sorted(
            [t.name for t in finance_tables()] + ["upload_review_operations"]
        )
        preparer = db.bind.dialect.identifier_preparer
        await db.execute(
            text(
                "LOCK TABLE "
                + ", ".join(preparer.quote(n) for n in names)
                + " IN SHARE ROW EXCLUSIVE MODE"
            )
        )
    elif db.bind.dialect.name == "sqlite":
        # Acquire SQLite's writer reservation before any state read, even in an
        # autobegun session. Separate-process writers serialize on the DB file.
        await db.execute(
            update(UploadReviewOperation)
            .where(UploadReviewOperation.id == "")
            .values(status="prepared")
        )
    else:
        raise ReviewError(
            "unsupported_database",
            "Reviewed imports require PostgreSQL or test SQLite",
            503,
        )


async def state_digest(db):
    state = {}
    for table in finance_tables():
        rows = [dict(r) for r in (await db.execute(select(table))).mappings()]
        state[table.name] = sorted(rows, key=encoded)
    return digest(state)


def restore_typed(value):
    """Decode only our durable canonical parser evidence for decision revisions."""
    if isinstance(value, list):
        return [restore_typed(v) for v in value]
    if isinstance(value, dict):
        if set(value) == {"$type", "$value"}:
            return {
                "Decimal": Decimal,
                "date": date.fromisoformat,
                "datetime": datetime.fromisoformat,
                "time": time.fromisoformat,
                "bytes": bytes.fromhex,
            }[value["$type"]](value["$value"])
        return {k: restore_typed(v) for k, v in value.items()}
    return value


def decision_transaction_overrides(entries, decisions):
    overrides = {}
    for entry, decision in zip(entries, decisions, strict=True):
        if decision["action"] == "update":
            row = UploadPreviewSourceRow.model_validate(entry["incoming_source"])
            overrides[decision["target_id"]] = {"date": row.date, "amount": row.amount}
    return overrides


async def snapshot_effects(db, snapshot_date, snapshots, entries=(), decisions=()):
    existing, latest, tables = {}, {}, {}
    asset_metadata_sources = []
    normalized, after = await snapshot_replacement_rows(
        db,
        snapshot_date,
        snapshots,
        preserve_missing_profile=True,
        asset_metadata_sources=asset_metadata_sources,
    )
    incoming_asset_keys = {
        (r["side"], r["category"], r["product_name"])
        for r in normalized.asset_snapshots
    }
    overrides = decision_transaction_overrides(entries, decisions)
    after["loans"] = await project_loan_repayment_estimates(
        db, after["loans"], transaction_overrides=overrides
    )
    for name, model in SNAPSHOT_MODELS.items():
        before = [
            snapshot_semantic_row(model, r)
            for r in (
                await db.execute(
                    select(model.__table__).where(model.snapshot_date == snapshot_date)
                )
            ).mappings()
        ]
        existing[name] = len(before)
        newest = await db.scalar(select(func.max(model.snapshot_date)))
        latest[name] = newest.isoformat() if newest else None
        if newest and snapshot_date < newest:
            raise ReviewError(
                "older_snapshot",
                "Snapshot date is older than an existing snapshot; prepare a newer export",
            )
        latest_rows = (
            [
                snapshot_semantic_row(model, r)
                for r in (
                    await db.execute(
                        select(model.__table__).where(model.snapshot_date == newest)
                    )
                ).mappings()
            ]
            if newest
            else []
        )
        incoming_rows = (
            ([normalized.user_profile] if normalized.user_profile is not None else [])
            if name == "user_profile_snapshots"
            else getattr(normalized, name)
        )
        tables[name] = {
            "fields": snapshot_semantic_fields(model),
            "before": canonical(sorted(before, key=encoded)),
            "latest": canonical(sorted(latest_rows, key=encoded)),
            "incoming": canonical(
                sorted(
                    [
                        snapshot_semantic_row(
                            model,
                            {**r, "snapshot_date": snapshot_date},
                            storage_scale=False,
                        )
                        for r in incoming_rows
                    ],
                    key=encoded,
                )
            ),
            "after": canonical(sorted(after[name], key=encoded)),
        }
    incoming = {
        name: len(getattr(normalized, name))
        for name in ("asset_snapshots", "insurance_contracts", "investments", "loans")
    }
    incoming["user_profile_snapshots"] = int(normalized.user_profile is not None)
    return {
        "tables": list(SNAPSHOT_MODELS),
        "existing_counts": existing,
        "incoming_counts": incoming,
        "final_counts": {name: len(rows) for name, rows in after.items()},
        "latest_dates": latest,
        "value_detail": {
            "version": 1,
            "tables": tables,
            "raw_snapshots": canonical(asdict(snapshots)),
            "transaction_overrides": canonical(
                [
                    {"transaction_id": target, **row}
                    for target, row in sorted(overrides.items())
                ]
            ),
            "asset_metadata_sources": canonical(
                sorted(
                    [
                        row
                        for row in asset_metadata_sources
                        if (row["side"], row["category"], row["product_name"])
                        in incoming_asset_keys
                    ],
                    key=encoded,
                )
            ),
            "generated_fields_excluded": ["id", "created_at", "updated_at"],
            "generated_fields_policy": "generated at apply; not forecast or approved semantic values",
        },
        "same_day_replacement": any(existing.values()),
        "policy": "replace only selected date; never erase later dates",
        "missing_profile_policy": "preserve existing profile unchanged when optional profile absent",
        "source_evidence": "append raw BankSalad evidence in the same transaction",
        "metadata_carry_forward": "shared exact asset identities and same-date loan user metadata",
        "loan_estimates": "recompute repayment estimates for incoming latest loan keys; user fields retained",
        "digest_scope": "all registered finance tables except review operations; conservative invalidation",
    }


def plan_digest(payload, state):
    return digest(
        {
            "state": state,
            "plan": {
                k: v
                for k, v in payload.items()
                if k not in ("plan_digest", "status", "result")
            },
        }
    )


def has_snapshot_detail(payload):
    detail = payload.get("snapshot_effects", {}).get("value_detail", {})
    if (
        not isinstance(detail, dict)
        or detail.get("version") != 1
        or "raw_snapshots" not in detail
        or not isinstance(detail.get("tables"), dict)
        or set(detail["tables"]) != set(SNAPSHOT_MODELS)
    ):
        return False
    for name, model in SNAPSHOT_MODELS.items():
        table = detail["tables"][name]
        fields = snapshot_semantic_fields(model)
        if not isinstance(table, dict) or table.get("fields") != fields:
            return False
        for phase in ("before", "latest", "incoming", "after"):
            rows = table.get(phase)
            if not isinstance(rows, list) or any(
                not isinstance(row, dict) or set(row) != set(fields) for row in rows
            ):
                return False
    return True


def response(op):
    return ReviewResponse.model_validate(op.payload)


async def get_review(db, operation_id):
    op = await db.get(UploadReviewOperation, operation_id, populate_existing=True)
    if op is None:
        raise ReviewError("unknown_operation", "Review operation not found", 404)
    return response(op)


async def prepare_review(
    db, *, file_bytes, filename, snapshot_date, context, excel_password=None
):
    rows, snapshots = parse_upload_workbook_contents(
        file_bytes=file_bytes, excel_password=excel_password
    )
    try:
        await lock_state(db)
        state = await state_digest(db)
        file_hash = sha256(file_bytes).hexdigest()
        binding = review_binding(file_hash, snapshot_date, context, rows, snapshots)
        # Repeated prepare must not reset a human-revised plan/version.
        previous = await db.scalar(
            select(UploadReviewOperation)
            .where(
                UploadReviewOperation.binding_digest == binding,
                UploadReviewOperation.state_digest == state,
                UploadReviewOperation.status == "prepared",
            )
            .order_by(UploadReviewOperation.created_at.desc())
            .execution_options(populate_existing=True)
        )
        if previous is not None and has_snapshot_detail(previous.payload):
            result = response(previous)
            await db.commit()
            return result
        entries = await build_review_entries(db, rows)
        decisions = [
            ReviewDecision(
                entry_id=e.entry_id,
                action=e.recommended_action,
                target_id=e.recommended_target_id,
            ).model_dump(mode="json")
            for e in entries
        ]
        entry_values = [e.model_dump(mode="json") for e in entries]
        effects = await snapshot_effects(
            db, snapshot_date, snapshots, entry_values, decisions
        )
        counts = Counter(e.change_type.value for e in entries)
        operation_id = str(uuid4())
        payload = {
            "operation_id": operation_id,
            "status": "prepared",
            "version": 1,
            "plan_digest": "0" * 64,
            "file_sha256": file_hash,
            "snapshot_date": snapshot_date.isoformat(),
            "context": context.model_dump(mode="json"),
            "entries": entry_values,
            "counts": {k: counts[k] for k in UploadPreviewChangeCounts.model_fields},
            "decisions": decisions,
            "snapshot_effects": effects,
            "result": None,
        }
        payload["plan_digest"] = plan_digest(payload, state)
        op = UploadReviewOperation(
            id=operation_id,
            binding_digest=binding,
            state_digest=state,
            file_sha256=file_hash,
            snapshot_date=snapshot_date,
            status="prepared",
            version=1,
            plan_digest=payload["plan_digest"],
            payload=payload,
        )
        db.add(op)
        await db.commit()
        return response(op)
    except Exception:
        await db.rollback()
        raise


async def locked_operation(db, operation_id):
    await lock_state(db)
    op = await db.scalar(
        select(UploadReviewOperation)
        .where(UploadReviewOperation.id == operation_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if op is None:
        raise ReviewError("unknown_operation", "Review operation not found", 404)
    return op


async def ensure_fresh(db, op):
    if op.status != "prepared":
        raise ReviewError(
            "not_prepared",
            "Operation is not prepared; read its canonical result or prepare again",
        )
    if plan_digest(op.payload, op.state_digest) != op.plan_digest:
        raise ReviewError("digest_mismatch", "Stored plan integrity check failed")
    if not has_snapshot_detail(op.payload):
        raise ReviewError(
            "snapshot_detail_required",
            "Prepared plan lacks value-level snapshot detail; prepare and approve again",
        )
    if await state_digest(db) != op.state_digest:
        op.status = "stale"
        op.payload = {**op.payload, "status": "stale"}
        await db.commit()  # persist stale without any financial write
        raise ReviewError(
            "stale_plan",
            "Ledger, metadata, or snapshots changed; new preparation and approval required",
        )


async def validate_decisions(db, entries, decisions):
    values = [d.model_dump(mode="json") for d in decisions]
    if [d["entry_id"] for d in values] != [e["entry_id"] for e in entries]:
        raise ReviewError(
            "invalid_decisions",
            "Every entry must appear exactly once, in plan order",
            422,
        )
    targets = []
    kept_targets = {
        c["transaction_id"]
        for e in entries
        if e["change_type"] == "unchanged"
        for c in e["candidates"]
    }
    for entry, decision in zip(entries, values, strict=True):
        if decision["action"] not in entry["allowed_actions"]:
            raise ReviewError("invalid_action", "Action not allowed for entry", 422)
        if (
            decision["action"] == "keep"
            and entry["existing_source"] is not None
            and len(entry["candidates"]) == 1
        ):
            kept_targets.add(entry["candidates"][0]["transaction_id"])
        if decision["action"] == "update":
            target = decision["target_id"]
            if target not in [c["transaction_id"] for c in entry["candidates"]]:
                raise ReviewError(
                    "invalid_target",
                    "Update target must be an exact plan candidate",
                    422,
                )
            tx = await db.get(Transaction, target, populate_existing=True)
            if tx is None or not active_target(tx):
                raise ReviewError(
                    "inactive_target",
                    "Deleted, merged, or superseded target cannot be mutated",
                    422,
                )
            targets.append(target)
    if len(targets) != len(set(targets)) or set(targets) & kept_targets:
        raise ReviewError(
            "conflicting_targets",
            "Duplicate update target or target protected by a kept entry",
            422,
        )
    return values


async def revise_review(db, operation_id, request: ReviewRevision):
    try:
        op = await locked_operation(db, operation_id)
        await ensure_fresh(db, op)
        if request.plan_digest != op.plan_digest:
            raise ReviewError("digest_mismatch", "Exact current plan digest required")
        values = await validate_decisions(db, op.payload["entries"], request.decisions)
        snapshots = SnapshotParseResult(
            **restore_typed(
                op.payload["snapshot_effects"]["value_detail"]["raw_snapshots"]
            )
        )
        effects = await snapshot_effects(
            db, op.snapshot_date, snapshots, op.payload["entries"], values
        )
        if (
            values != op.payload["decisions"]
            or effects != op.payload["snapshot_effects"]
        ):
            op.version += 1
            payload = {
                **op.payload,
                "version": op.version,
                "decisions": values,
                "snapshot_effects": effects,
            }
            payload["plan_digest"] = plan_digest(payload, op.state_digest)
            op.plan_digest, op.payload = payload["plan_digest"], payload
        result = response(op)
        await db.commit()
        return result
    except Exception:
        await db.rollback()
        raise


async def verify_snapshots(
    db, snapshot_date, normalized, preserved_profile, *, approved_effects
):
    expected = {
        name: getattr(normalized, name)
        for name in ("asset_snapshots", "insurance_contracts", "investments", "loans")
    }
    expected["user_profile_snapshots"] = (
        [normalized.user_profile]
        if normalized.user_profile is not None
        else preserved_profile
    )
    counts = {}
    for name, model in SNAPSHOT_MODELS.items():
        actual = list(
            (
                await db.execute(
                    select(model.__table__).where(model.snapshot_date == snapshot_date)
                )
            ).mappings()
        )
        counts[name] = len(actual)
        incoming = expected[name]
        if len(actual) != len(incoming):
            raise ReviewError(
                "snapshot_verification_failed",
                "Stored snapshot count does not match approved effects",
                500,
            )
        # Compare every parsed source field; metadata/loan estimates are additional.
        fields = set().union(*(set(r) for r in incoming)) if incoming else set()
        fields -= {"id", "created_at", "updated_at"}
        source_rows = [snapshot_semantic_row(model, row) for row in incoming]
        if sorted(encoded({k: r[k] for k in fields}) for r in actual) != sorted(
            encoded({k: r[k] for k in fields}) for r in source_rows
        ):
            raise ReviewError(
                "snapshot_verification_failed",
                "Stored snapshot semantics differ from source",
                500,
            )
        semantic_actual = canonical(
            sorted([snapshot_semantic_row(model, row) for row in actual], key=encoded)
        )
        if semantic_actual != approved_effects["value_detail"]["tables"][name]["after"]:
            raise ReviewError(
                "snapshot_verification_failed",
                "Stored final snapshot values or metadata differ from approved effects",
                500,
            )
    return counts


async def apply_review(
    db,
    operation_id,
    *,
    file_bytes,
    filename,
    snapshot_date,
    request: ReviewApplyRequest,
    upload_dir: Path,
    excel_password=None,
):
    # File/context/date and the exact full approval-bound request are checked even
    # on replay. A timeout must reconcile GET; changed ref/decisions never rerun.
    request_hash = digest(
        {
            "request": request.model_dump(mode="json"),
            "file": sha256(file_bytes).hexdigest(),
            "date": snapshot_date,
        }
    )
    try:
        op = await locked_operation(db, operation_id)
        if op.status == "applied":
            if op.applied_request_digest != request_hash:
                raise ReviewError(
                    "replay_mismatch", "Applied operation refuses a different request"
                )
            result = response(op)
            await db.commit()
            return result
        # New approvals require a whitespace-free exact locator. Validate after
        # the applied replay branch so a formerly accepted historical locator
        # can still reconcile its identical stored request without another write.
        if any(char.isspace() for char in request.approval_reference):
            raise ReviewError(
                "invalid_approval_reference",
                "Approval reference must be a whitespace-free canonical locator",
                422,
            )
        if (
            request.plan_digest != op.plan_digest
            or request.context.model_dump(mode="json") != op.payload["context"]
            or sha256(file_bytes).hexdigest() != op.file_sha256
            or snapshot_date != op.snapshot_date
            or [d.model_dump(mode="json") for d in request.decisions]
            != op.payload["decisions"]
        ):
            raise ReviewError(
                "binding_mismatch",
                "Exact stored digest, context, file, date and full decisions required",
            )
        await ensure_fresh(db, op)
        values = await validate_decisions(db, op.payload["entries"], request.decisions)
        parsed_rows, snapshots = parse_upload_workbook_contents(
            file_bytes=file_bytes, excel_password=excel_password
        )
        if (
            review_binding(
                op.file_sha256, snapshot_date, request.context, parsed_rows, snapshots
            )
            != op.binding_digest
        ):
            op.status = "stale"
            op.payload = {**op.payload, "status": "stale"}
            await db.commit()  # invalidate interpretation only; no financial write
            raise ReviewError(
                "parsed_source_changed",
                "Workbook interpretation changed; prepare and approve again",
            )
        current_effects = await snapshot_effects(
            db, snapshot_date, snapshots, op.payload["entries"], values
        )
        if current_effects != op.payload["snapshot_effects"]:
            raise ReviewError(
                "snapshot_policy_changed",
                "Snapshot effects changed; prepare and approve again",
            )
        preserved_profile = (
            [
                dict(r)
                for r in (
                    await db.execute(
                        select(UserProfileSnapshot.__table__).where(
                            UserProfileSnapshot.snapshot_date == snapshot_date
                        )
                    )
                ).mappings()
            ]
            if snapshots.user_profile is None
            else []
        )
        log = UploadLog(
            filename=filename,
            snapshot_date=snapshot_date,
            status="processing",
            reconciliation_mode="reviewed_apply",
        )
        db.add(log)
        await db.flush()
        await db.refresh(log)
        applied, kept = [], []
        for entry, decision in zip(op.payload["entries"], values, strict=True):
            if decision["action"] == "keep":
                kept.append(entry["entry_id"])
                continue  # no lifecycle, timestamp, user-field or link touch
            row = parsed_rows[int(entry["entry_id"]) - 1]
            if (
                UploadPreviewSourceRow.model_validate(row).model_dump(mode="json")
                != entry["incoming_source"]
            ):
                raise ReviewError(
                    "parsed_source_changed",
                    "Workbook parser output changed; prepare and approve again",
                )
            touch = LifecycleTouch(
                row_hash=source_row_hash_from_row(row),
                upload_log_id=log.id,
                uploaded_at=log.uploaded_at,
                lifecycle_status=TransactionSourceLifecycleStatus.ACTIVE
                if decision["action"] == "add"
                else TransactionSourceLifecycleStatus.SOURCE_CHANGED,
            )
            if decision["action"] == "add":
                tx = build_imported_transaction(row, touch)
                db.add(tx)
            else:
                tx = await db.get(Transaction, decision["target_id"])
                apply_source_managed_row_update(tx, row)
                touch_transaction_source_lifecycle(tx, touch)
            await db.flush()
            applied.append(
                {
                    "entry_id": entry["entry_id"],
                    "action": decision["action"],
                    "transaction_id": tx.id,
                }
            )
        normalized = await replace_snapshots(
            db, snapshot_date, snapshots, preserve_missing_profile=True
        )
        await db.flush()
        await apply_loan_repayment_estimates_for_latest_snapshots(
            db,
            loan_keys=[
                (str(r["lender"]), str(r["product_name"])) for r in normalized.loans
            ],
        )
        await db.flush()
        counts = await verify_snapshots(
            db,
            snapshot_date,
            normalized,
            preserved_profile,
            approved_effects=current_effects,
        )
        result_data = {
            "upload_id": log.id,
            "applied": applied,
            "kept": kept,
            "snapshot_counts": counts,
            "snapshot_verified": True,
            "decision_digest": digest(values),
            "approval_reference": request.approval_reference,
        }
        log.tx_total = sum(
            e["incoming_source"] is not None for e in op.payload["entries"]
        )
        log.tx_new = sum(a["action"] == "add" for a in applied)
        log.tx_skipped = log.tx_total - log.tx_new
        log.status = "success"
        log.reconciliation_audit = encoded(
            {
                "operation_id": op.id,
                "version": op.version,
                "plan_digest": op.plan_digest,
                "decision_digest": result_data["decision_digest"],
                "approval_reference": request.approval_reference,
                "decisions": values,
                "snapshot_counts": counts,
                "snapshot_verified": True,
            }
        )
        op.status, op.applied_request_digest = "applied", request_hash
        op.payload = {**op.payload, "status": "applied", "result": result_data}
        result = response(op)
        await db.commit()  # single atomic commit: mutations, audit and canonical result
    except Exception:
        await db.rollback()
        raise
    try:
        persist_original_upload(
            upload_dir=upload_dir,
            upload_id=result.result.upload_id,
            filename=filename,
            file_bytes=file_bytes,
        )
    except OSError:
        # Retention is not the import transaction and never triggers replay. Do
        # not include filename/exception/private source text in application logs.
        try:
            saved_log = await db.get(UploadLog, result.result.upload_id)
            saved_log.error_message = (
                "warning: original upload retention failed; import committed"
            )
            await db.commit()
        except Exception:
            await db.rollback()
    return result
