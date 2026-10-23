"""Synthetic exact-plan regression cases from the finance acceptance contract."""

from copy import deepcopy
from datetime import timedelta

import pytest

from sqlalchemy import select

from app.models.transaction import Transaction
from app.models.upload_review_operation import UploadReviewOperation
from app.schemas.upload_review import ReviewDecision, ReviewRevision
from app.services import upload_review_service as svc
from test_upload_review_service import (
    DAY,
    apply,
    apply_request,
    prepare,
    row,
    tx,
    workbook,
)


@pytest.mark.parametrize("space", [" ", "\n", "\t", "\u00a0"])
async def test_new_approval_locator_has_no_internal_whitespace(
    db_session, tmp_path, space
):
    data = workbook()
    plan = await prepare(db_session, data)
    before = await svc.state_digest(db_session)
    request = apply_request(
        plan, approval_reference=f"hermes://finance/{space}message/42"
    )
    with pytest.raises(svc.ReviewError) as exc:
        await apply(db_session, plan, tmp_path, data, request=request)
    assert exc.value.code == "invalid_approval_reference"
    assert exc.value.status_code == 422
    assert await svc.state_digest(db_session) == before


def changed_parser(original, mutation):
    def parse(**kwargs):
        rows, snapshots = original(**kwargs)
        if mutation == "snapshot_value":
            snapshots.asset_snapshots[0]["amount"] += 1
        elif mutation == "kept_row":
            rows[0]["description"] = "changed parser interpretation"
        elif mutation == "extra_row":
            rows.append(row("unexpected parsed occurrence"))
        elif mutation == "missing_row":
            rows.clear()
        elif mutation == "raw_evidence":
            snapshots.cashflow_benchmarks.append(
                {
                    "period": "synthetic",
                    "transaction_type": "지출",
                    "category_major": "기타",
                    "amount": 1,
                }
            )
        return rows, snapshots

    return parse


@pytest.mark.parametrize(
    "mutation",
    ["snapshot_value", "kept_row", "extra_row", "missing_row", "raw_evidence"],
)
async def test_same_bytes_parser_drift_refused_before_any_write(
    db_session, tmp_path, monkeypatch, mutation
):
    data = workbook()
    plan = await prepare(db_session, data)
    plan = await svc.revise_review(
        db_session,
        plan.operation_id,
        ReviewRevision(
            plan_digest=plan.plan_digest,
            decisions=[ReviewDecision(entry_id="1", action="keep", target_id=None)],
        ),
    )
    before = await svc.state_digest(db_session)
    monkeypatch.setattr(
        svc,
        "parse_upload_workbook_contents",
        changed_parser(svc.parse_upload_workbook_contents, mutation),
    )
    with pytest.raises(svc.ReviewError) as exc:
        await apply(db_session, plan, tmp_path, data)
    assert exc.value.code == "parsed_source_changed"
    assert await svc.state_digest(db_session) == before
    assert (await svc.get_review(db_session, plan.operation_id)).result is None
    # Explicit reprepare may create a fresh proposal, never transplant approval.
    fresh = await prepare(db_session, data)
    assert fresh.operation_id != plan.operation_id
    assert (await svc.get_review(db_session, plan.operation_id)).status == "stale"
    assert fresh.result is None


@pytest.mark.parametrize("shape", ["missing", "duplicate", "reordered", "extra"])
async def test_complete_ordered_decisions_required_at_revision_and_apply(
    db_session, tmp_path, shape
):
    data = workbook([row("one", -1), row("two", -2)])
    plan = await prepare(db_session, data)
    decisions = deepcopy(plan.decisions)
    if shape == "missing":
        decisions.pop()
    elif shape == "duplicate":
        decisions[1] = decisions[0]
    elif shape == "reordered":
        decisions.reverse()
    else:
        decisions.append(ReviewDecision(entry_id="3", action="keep", target_id=None))
    before = await svc.state_digest(db_session)
    with pytest.raises(svc.ReviewError) as exc:
        await svc.revise_review(
            db_session,
            plan.operation_id,
            ReviewRevision(plan_digest=plan.plan_digest, decisions=decisions),
        )
    assert exc.value.code == "invalid_decisions"
    with pytest.raises(svc.ReviewError) as exc:
        await apply(
            db_session,
            plan,
            tmp_path,
            data,
            request=apply_request(plan, decisions=decisions),
        )
    assert exc.value.code == "binding_mismatch"
    assert await svc.state_digest(db_session) == before


@pytest.mark.parametrize("changed", ["file", "date", "context", "digest", "decisions"])
async def test_applied_replay_cannot_change_any_binding(db_session, tmp_path, changed):
    data = workbook()
    plan = await prepare(db_session, data)
    done = await apply(db_session, plan, tmp_path, data)
    before = await svc.state_digest(db_session)
    request = apply_request(plan)
    kw = {}
    if changed == "file":
        data += b"different"
    elif changed == "date":
        kw["snapshot_date"] = DAY + timedelta(days=1)
    elif changed == "context":
        request.context.archive_hash = "c" * 64
    elif changed == "digest":
        request.plan_digest = "0" * 64
    else:
        request.decisions[0].action = "keep"
    with pytest.raises(svc.ReviewError) as exc:
        await apply(db_session, plan, tmp_path, data, request=request, **kw)
    assert exc.value.code == "replay_mismatch"
    assert await svc.state_digest(db_session) == before
    assert (
        await svc.get_review(db_session, plan.operation_id)
    ).model_dump() == done.model_dump()


@pytest.mark.parametrize("mutation", ["deleted", "merged", "removed"])
async def test_candidate_changed_after_prepare_is_durable_stale(
    db_session, tmp_path, mutation
):
    target, other = tx(name="target", amount=-1), tx(name="other", amount=-2)
    db_session.add_all([target, other])
    await db_session.commit()
    data = workbook([row("target", -1, category_major="corrected")])
    plan = await prepare(db_session, data)
    if mutation == "deleted":
        target.is_deleted = True
    elif mutation == "merged":
        target.merged_into_id = other.id
    else:
        await db_session.delete(target)
    await db_session.commit()
    before = await svc.state_digest(db_session)
    with pytest.raises(svc.ReviewError) as exc:
        await apply(db_session, plan, tmp_path, data)
    assert exc.value.code == "stale_plan"
    assert await svc.state_digest(db_session) == before
    assert (await svc.get_review(db_session, plan.operation_id)).status == "stale"


@pytest.mark.parametrize("ambiguous", [False, True])
async def test_keep_protection_exact_set_not_all_ambiguous_candidates(
    db_session, tmp_path, ambiguous
):
    first = tx(name="shared", amount=-1, seconds=1)
    db_session.add(first)
    if ambiguous:
        db_session.add(tx(name="shared", amount=-1, seconds=2))
    await db_session.commit()
    data = workbook(
        [
            row("shared", -1, seconds=3),
            row("shared", -1, seconds=4, category_major="corrected"),
        ]
    )
    plan = await prepare(db_session, data)
    assert len(plan.entries[0].candidates) == (2 if ambiguous else 1)
    decisions = [
        ReviewDecision(entry_id="1", action="keep", target_id=None),
        ReviewDecision(entry_id="2", action="update", target_id=first.id),
    ]
    revision = ReviewRevision(plan_digest=plan.plan_digest, decisions=decisions)
    if not ambiguous:
        with pytest.raises(svc.ReviewError) as exc:
            await svc.revise_review(db_session, plan.operation_id, revision)
        assert exc.value.code == "conflicting_targets"
    else:
        revised = await svc.revise_review(db_session, plan.operation_id, revision)
        done = await apply(db_session, revised, tmp_path, data)
        assert done.result is not None
        assert done.result.kept == ["1"]
        assert done.result.applied[0].transaction_id == first.id
        assert len((await db_session.scalars(select(Transaction))).all()) == 2


async def test_rollback_restores_full_existing_state_evidence_and_links(
    db_session, tmp_path, monkeypatch
):
    # A successful synthetic initial import seeds snapshots, raw evidence and audit.
    data = workbook(full_snapshots=True)
    initial = await prepare(db_session, data)
    await apply(db_session, initial, tmp_path, data)
    target = await db_session.scalar(select(Transaction))
    target.memo = "synthetic user note"
    await db_session.commit()
    corrected = workbook(
        [row(category_major="corrected"), row("new", -2)],
        asset=999,
        full_snapshots=True,
    )
    plan = await prepare(db_session, corrected)
    before = await svc.state_digest(db_session)

    async def fail(*args, **kwargs):
        raise RuntimeError(
            "synthetic failure after snapshots/evidence/transaction writes"
        )

    monkeypatch.setattr(svc, "verify_snapshots", fail)
    with pytest.raises(RuntimeError):
        await apply(db_session, plan, tmp_path, corrected)
    # Full registered-table digest includes every snapshot/evidence/link/audit table.
    assert await svc.state_digest(db_session) == before
    assert (await svc.get_review(db_session, plan.operation_id)).status == "prepared"
    assert (await svc.get_review(db_session, plan.operation_id)).result is None


async def test_normalizer_drift_is_bound_even_when_raw_parser_is_unchanged(
    db_session, tmp_path, monkeypatch
):
    data = workbook()
    plan = await prepare(db_session, data)
    original = svc.normalize_snapshots_for_storage

    def normalize(snapshots):
        changed = deepcopy(original(snapshots))
        changed.asset_snapshots[0]["amount"] += 1
        return changed

    before = await svc.state_digest(db_session)
    monkeypatch.setattr(svc, "normalize_snapshots_for_storage", normalize)
    with pytest.raises(svc.ReviewError) as exc:
        await apply(db_session, plan, tmp_path, data)
    assert exc.value.code == "parsed_source_changed"
    assert await svc.state_digest(db_session) == before


async def test_preupgrade_prepared_binding_requires_fresh_prepare_and_approval(
    db_session, tmp_path
):
    data = workbook()
    plan = await prepare(db_session, data)
    stored = await db_session.get(UploadReviewOperation, plan.operation_id)
    stored.binding_digest = svc.digest(
        {
            "file": plan.file_sha256,
            "date": DAY,
            "context": plan.context.model_dump(mode="json"),
        }
    )
    await db_session.commit()
    before = await svc.state_digest(db_session)
    with pytest.raises(svc.ReviewError) as exc:
        await apply(db_session, plan, tmp_path, data)
    assert exc.value.code == "parsed_source_changed"
    assert await svc.state_digest(db_session) == before
    fresh = await prepare(db_session, data)
    assert fresh.operation_id != plan.operation_id
    assert fresh.result is None


async def test_stored_plan_tampering_cannot_be_signed_by_revision(db_session, tmp_path):
    data = workbook()
    plan = await prepare(db_session, data)
    stored = await db_session.get(UploadReviewOperation, plan.operation_id)
    changed = deepcopy(stored.payload)
    changed["entries"][0]["reason"] = "tampered synthetic payload"
    stored.payload = changed
    await db_session.commit()
    before = await svc.state_digest(db_session)
    with pytest.raises(svc.ReviewError) as exc:
        await svc.revise_review(
            db_session,
            plan.operation_id,
            ReviewRevision(plan_digest=plan.plan_digest, decisions=plan.decisions),
        )
    assert exc.value.code == "digest_mismatch"
    with pytest.raises(svc.ReviewError) as exc:
        await apply(db_session, plan, tmp_path, data)
    assert exc.value.code == "digest_mismatch"
    assert await svc.state_digest(db_session) == before


@pytest.mark.parametrize(
    "locator",
    ["hermes://finance/42", "hermes://finance/a b/42", "hermes://finance/a\nb/42"],
)
async def test_preupgrade_applied_result_exact_replay_is_read_only(
    db_session, tmp_path, locator
):
    data = workbook()
    plan = await prepare(db_session, data)
    await apply(db_session, plan, tmp_path, data)
    # Model a persisted preupgrade result with its exact old binding/request.
    # Fixture mutation only, never a production migration or financial replay.
    request = apply_request(plan, approval_reference=locator)
    stored = await db_session.get(UploadReviewOperation, plan.operation_id)
    stored.binding_digest = svc.digest(
        {
            "file": plan.file_sha256,
            "date": DAY,
            "context": plan.context.model_dump(mode="json"),
        }
    )
    stored.applied_request_digest = svc.digest(
        {
            "request": request.model_dump(mode="json"),
            "file": plan.file_sha256,
            "date": DAY,
        }
    )
    stored.payload = {
        **stored.payload,
        "result": {**stored.payload["result"], "approval_reference": locator},
    }
    await db_session.commit()
    before = await svc.state_digest(db_session)
    expected = await svc.get_review(db_session, plan.operation_id)
    replay = await apply(db_session, plan, tmp_path, data, request=request)
    assert replay.model_dump() == expected.model_dump()
    assert await svc.state_digest(db_session) == before
