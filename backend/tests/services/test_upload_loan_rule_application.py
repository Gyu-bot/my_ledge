"""T065: synthetic upload rule coverage, atomicity and reviewed estimate binding."""

from datetime import date
import json

import pytest
from sqlalchemy import func, select

from app.models.auto_classification import AutoClassificationSettings, LoanMerchantRule
from app.models.loan import Loan
from app.models.loan_account import LoanAccount
from app.models.loan_transaction_link import LoanTransactionLink
from app.models.transaction import Transaction
from app.models.upload_log import UploadLog
from app.schemas.upload import UploadApplyRequest, UploadApplySelection
from app.services import upload_review_service as reviews
from app.services import upload_rollback_service as rollback_points
from app.services.upload_preview_service import preview_transaction_upload_workbook
from test_upload_review_service import CONTEXT, DAY, apply, prepare, row, tx, workbook


async def seed_rule(db):
    account = LoanAccount(lender="synthetic-lender", product_name="loan")
    manual_account = LoanAccount(lender="synthetic-other", product_name="loan")
    manual = tx(name="synthetic-rule", seconds=1)
    db.add_all([account, manual_account, manual])
    await db.flush()
    db.add_all(
        [
            LoanMerchantRule(
                merchant="synthetic-rule",
                loan_account_id=account.id,
                repayment_type="mixed",
            ),
            LoanTransactionLink(
                transaction_id=manual.id,
                loan_account_id=manual_account.id,
                source="manual",
                repayment_type="interest",
                memo="synthetic manual",
            ),
        ]
    )
    await db.commit()
    return account.id, manual.id, manual_account.id


async def upload_http(client, headers, db, tmp_path, monkeypatch, mode, data):
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path / "uploads"))
    files = {"file": ("synthetic.xlsx", data)}
    if mode == "explicit":
        preview = await preview_transaction_upload_workbook(db, data)
        request = UploadApplyRequest(
            confirmation=True,
            selections=[
                UploadApplySelection(
                    change_type=c.change_type,
                    source_row_hash=c.source_row_hash,
                    existing_transaction_id=c.existing_transaction_id,
                )
                for c in preview.safe_changes
                if c.source_row_hash
            ],
        )
        return await client.post(
            "/api/v1/upload/apply",
            headers=headers,
            files=files,
            data={
                "snapshot_date": DAY.isoformat(),
                "apply_request": request.model_dump_json(),
            },
        )
    prepared = await client.post(
        "/api/v1/upload/review/prepare",
        headers=headers,
        files=files,
        data={"snapshot_date": DAY.isoformat(), "context": json.dumps(CONTEXT)},
    )
    assert prepared.status_code == 200, prepared.text
    plan = prepared.json()
    request = {
        "confirmation": True,
        "plan_digest": plan["plan_digest"],
        "context": CONTEXT,
        "decisions": plan["decisions"],
        "snapshot_effect_ack": True,
        "approval_reference": "hermes://finance/synthetic/42",
    }
    return await client.post(
        f"/api/v1/upload/review/{plan['operation_id']}/apply",
        headers=headers,
        files=files,
        data={"snapshot_date": DAY.isoformat(), "apply_request": json.dumps(request)},
    )


@pytest.mark.parametrize("mode", ["explicit", "reviewed"])
@pytest.mark.parametrize("enabled", [True, False])
async def test_current_upload_http_applies_only_enabled_rules_and_preserves_manual(
    async_client, api_headers, db_session, tmp_path, monkeypatch, mode, enabled
):
    account_id, manual_id, manual_account_id = await seed_rule(db_session)
    if not enabled:
        db_session.add(
            AutoClassificationSettings(id=1, apply_loan_rules_on_upload=False)
        )
        await db_session.commit()
    result = await upload_http(
        async_client,
        api_headers,
        db_session,
        tmp_path,
        monkeypatch,
        mode,
        workbook([row("synthetic-rule", -200)]),
    )
    assert result.status_code == 200, result.text
    links = list((await db_session.scalars(select(LoanTransactionLink))).all())
    manual = next(link for link in links if link.transaction_id == manual_id)
    assert (
        manual.loan_account_id,
        manual.source,
        manual.repayment_type,
        manual.memo,
    ) == (manual_account_id, "manual", "interest", "synthetic manual")
    automatic = [link for link in links if link.transaction_id != manual_id]
    assert len(automatic) == int(enabled)
    if automatic:
        assert (automatic[0].loan_account_id, automatic[0].source) == (
            account_id,
            "auto",
        )


@pytest.mark.parametrize("mode", ["explicit", "reviewed"])
async def test_rule_links_and_upload_are_atomic_on_final_failure(
    async_client, api_headers, db_session, tmp_path, monkeypatch, mode
):
    await seed_rule(db_session)
    before = await db_session.scalar(select(func.count()).select_from(Transaction))

    async def fail_after_rules(db, *_args):
        assert (
            await db.scalar(select(func.count()).select_from(LoanTransactionLink)) == 2
        )
        raise RuntimeError("synthetic failure after rule links")

    monkeypatch.setattr(rollback_points, "finish_point", fail_after_rules)
    with pytest.raises(RuntimeError, match="after rule links"):
        await upload_http(
            async_client,
            api_headers,
            db_session,
            tmp_path,
            monkeypatch,
            mode,
            workbook([row("synthetic-rule", -200)]),
        )
    assert (
        await db_session.scalar(select(func.count()).select_from(Transaction)) == before
    )
    assert (
        await db_session.scalar(select(func.count()).select_from(LoanTransactionLink))
        == 1
    )
    assert await db_session.scalar(select(func.count()).select_from(UploadLog)) == 0


async def test_reviewed_preview_projects_new_rule_links_without_writes(
    db_session, tmp_path
):
    account_id, _, _ = await seed_rule(db_session)
    db_session.add(tx(name="synthetic-rule", amount=-200, date=date(2026, 8, 15)))
    await db_session.commit()
    data = workbook(
        [row("synthetic-rule", -200, date=date(2026, 9, 15))], full_snapshots=True
    )
    plan = await prepare(db_session, data)
    projected = reviews.restore_typed(
        plan.snapshot_effects["value_detail"]["tables"]["loans"]["after"]
    )[0]
    assert projected["monthly_payment"] == 200
    assert projected["repayment_method"] == "principal_interest"
    assert (
        await db_session.scalar(select(func.count()).select_from(LoanTransactionLink))
        == 1
    )
    assert await db_session.scalar(select(func.count()).select_from(Loan)) == 0
    done = await apply(db_session, plan, tmp_path, data)
    assert done.result.snapshot_verified
    loan = await db_session.scalar(select(Loan))
    assert loan.monthly_payment == 200
    assert (
        await db_session.scalar(
            select(func.count())
            .select_from(LoanTransactionLink)
            .where(LoanTransactionLink.loan_account_id == account_id)
        )
        == 2
    )


@pytest.mark.parametrize("change", ["rule", "settings"])
async def test_reviewed_rule_or_toggle_change_invalidates_approval(
    db_session, tmp_path, change
):
    await seed_rule(db_session)
    data = workbook([row("synthetic-rule", -200)])
    plan = await prepare(db_session, data)
    if change == "rule":
        rule = await db_session.scalar(select(LoanMerchantRule))
        rule.repayment_type = "interest"
    else:
        db_session.add(
            AutoClassificationSettings(id=1, apply_loan_rules_on_upload=False)
        )
    await db_session.commit()
    with pytest.raises(reviews.ReviewError, match="changed"):
        await apply(db_session, plan, tmp_path, data)
    assert await db_session.scalar(select(func.count()).select_from(UploadLog)) == 0
