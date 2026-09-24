from datetime import date, time
from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.auto_classification import (
    AutoClassificationSettings,
    CategoryClassificationRule,
    LoanMerchantRule,
    RecurringCategoryRule,
)
from app.models.loan import Loan
from app.models.loan_account import LoanAccount
from app.models.loan_transaction_link import LoanTransactionLink
from app.models.transaction import Transaction
from app.services.auto_classification_service import (
    apply_enabled_auto_classification_after_upload,
    apply_loan_merchant_rules,
)


PREFIX = "/api/v1/auto-classification"


def transaction(**overrides) -> Transaction:
    values = {
        "date": date(2026, 1, 5),
        "time": time(9),
        "type": "지출",
        "category_major": "구독",
        "category_minor": "서비스",
        "merchant": "예시서비스",
        "description": "예시서비스",
        "amount": -10000,
        "source": "import",
    }
    return Transaction(**(values | overrides))


async def seed_recurring(db_session: AsyncSession) -> list[Transaction]:
    rows = [transaction(date=date(2026, month, 5)) for month in (1, 2)]
    db_session.add_all(
        rows
        + [
            RecurringCategoryRule(
                category_major="구독", recurring_payment_kind="monthly_recurring"
            )
        ]
    )
    await db_session.commit()
    return rows


async def preview(async_client, api_headers):
    response = await async_client.get(
        f"{PREFIX}/recurring-category-rules/dry-run", headers=api_headers
    )
    assert response.status_code == 200
    return response.json()["items"]


def approval(item, **overrides):
    return {
        "merchant": item["merchant"],
        "proposed_kind": item["proposed_kind"],
        "preview_token": item["preview_token"],
        **overrides,
    }


async def test_preview_approval_never_expands_to_unrelated_merchant_rows(
    async_client: AsyncClient,
    api_headers,
    db_session: AsyncSession,
):
    rows = await seed_recurring(db_session)
    excluded = [
        transaction(category_major="선물"),
        transaction(amount=10000),
        transaction(is_deleted=True),
        transaction(merged_into_id=rows[0].id),
        transaction(recurring_payment_kind="not_recurring"),
    ]
    db_session.add_all(excluded)
    await db_session.commit()
    item = (await preview(async_client, api_headers))[0]
    assert {row["id"] for row in item["matched_transactions"]} == {
        row.id for row in rows
    }
    response = await async_client.post(
        f"{PREFIX}/apply/recurring-dry-run", headers=api_headers, json=approval(item)
    )
    assert response.json() == {"updated": 2}
    for row in excluded:
        await db_session.refresh(row)
        assert row.recurring_payment_kind in {None, "not_recurring"}
    replay = await async_client.post(
        f"{PREFIX}/apply/recurring-dry-run", headers=api_headers, json=approval(item)
    )
    assert replay.status_code == 409


@pytest.mark.parametrize(
    "change", ["new_row", "category", "classification", "amount", "settings", "rule"]
)
async def test_stale_recurring_preview_rejects_atomically(
    async_client: AsyncClient,
    api_headers,
    db_session: AsyncSession,
    change: str,
):
    rows = await seed_recurring(db_session)
    item = (await preview(async_client, api_headers))[0]
    if change == "new_row":
        db_session.add(transaction(date=date(2026, 3, 5)))
    elif change == "category":
        rows[0].category_major_user = "선물"
    elif change == "classification":
        rows[0].recurring_payment_kind = "not_recurring"
    elif change == "amount":
        rows[0].amount = -11000
    elif change == "rule":
        from sqlalchemy import select

        rule = await db_session.scalar(select(RecurringCategoryRule))
        rule.recurring_payment_kind = "installment"
    else:
        await async_client.patch(
            "/api/v1/settings/analytics",
            headers=api_headers,
            json={"recurring_dry_run": {"min_occurrences": 3}},
        )
    await db_session.commit()
    response = await async_client.post(
        f"{PREFIX}/apply/recurring-dry-run", headers=api_headers, json=approval(item)
    )
    assert response.status_code == 409
    await db_session.refresh(rows[1])
    assert rows[1].recurring_payment_kind is None


async def test_reviewed_scope_requires_and_applies_explicit_preview_subset(
    async_client: AsyncClient,
    api_headers,
    db_session: AsyncSession,
):
    rows = await seed_recurring(db_session)
    await async_client.patch(
        "/api/v1/settings/analytics",
        headers=api_headers,
        json={"recurring_dry_run": {"default_apply_scope": "reviewed_only"}},
    )
    item = (await preview(async_client, api_headers))[0]
    assert item["default_apply_scope"] == "reviewed_only"
    for ids in (None, [999999]):
        response = await async_client.post(
            f"{PREFIX}/apply/recurring-dry-run",
            headers=api_headers,
            json=approval(item, transaction_ids=ids),
        )
        assert response.status_code == 422
    response = await async_client.post(
        f"{PREFIX}/apply/recurring-dry-run",
        headers=api_headers,
        json=approval(item, transaction_ids=[rows[0].id]),
    )
    assert response.json() == {"updated": 1}
    await db_session.refresh(rows[1])
    assert rows[1].recurring_payment_kind is None
    # Reviewed historical observations remain evidence for the still-unclassified row.
    assert (
        len((await preview(async_client, api_headers))[0]["matched_transactions"]) == 1
    )


@pytest.mark.parametrize(
    "setting,value",
    [
        ("min_occurrences", 3),
        ("min_distinct_months", 3),
        ("min_distinct_days", 3),
        ("monthly_interval_days_min", 32),
        ("monthly_interval_days_max", 30),
    ],
)
async def test_recurring_detection_uses_occurrence_and_monthly_settings(
    async_client: AsyncClient,
    api_headers,
    db_session: AsyncSession,
    setting,
    value,
):
    rows = await seed_recurring(db_session)
    rows[
        0
    ].cost_kind = "fixed"  # Fixed classification must not bypass edited thresholds.
    await db_session.commit()
    assert await preview(async_client, api_headers)
    response = await async_client.patch(
        "/api/v1/settings/analytics",
        headers=api_headers,
        json={"recurring_dry_run": {setting: value}},
    )
    assert response.status_code == 200
    assert await preview(async_client, api_headers) == []


@pytest.mark.parametrize(
    "setting,value", [("max_amount_cv", 0.01), ("minimum_confidence", 0.99)]
)
async def test_recurring_detection_uses_amount_and_confidence_settings(
    async_client: AsyncClient,
    api_headers,
    db_session: AsyncSession,
    setting,
    value,
):
    rows = await seed_recurring(db_session)
    rows[0].amount = -12000
    await db_session.commit()
    assert await preview(async_client, api_headers)
    await async_client.patch(
        "/api/v1/settings/analytics",
        headers=api_headers,
        json={"recurring_dry_run": {setting: value}},
    )
    assert await preview(async_client, api_headers) == []


@pytest.mark.parametrize(
    "setting,value", [("weekly_interval_days_min", 8), ("weekly_interval_days_max", 6)]
)
async def test_recurring_detection_uses_weekly_settings(
    async_client: AsyncClient,
    api_headers,
    db_session: AsyncSession,
    setting,
    value,
):
    rows = await seed_recurring(db_session)
    rows[0].date, rows[1].date = date(2026, 1, 28), date(2026, 2, 4)
    await db_session.commit()
    assert await preview(async_client, api_headers)
    await async_client.patch(
        "/api/v1/settings/analytics",
        headers=api_headers,
        json={"recurring_dry_run": {setting: value}},
    )
    assert await preview(async_client, api_headers) == []


async def test_recurring_upload_setting_and_legacy_toggle_share_effective_value(
    async_client: AsyncClient,
    api_headers,
    db_session: AsyncSession,
):
    rows = await seed_recurring(db_session)
    await apply_enabled_auto_classification_after_upload(db_session)
    assert rows[0].recurring_payment_kind is None
    await async_client.patch(
        "/api/v1/settings/analytics",
        headers=api_headers,
        json={"recurring_dry_run": {"upload_auto_apply": True}},
    )
    legacy = await async_client.get(f"{PREFIX}/settings", headers=api_headers)
    assert legacy.json()["apply_recurring_rules_on_upload"] is True
    await apply_enabled_auto_classification_after_upload(db_session)
    assert rows[0].recurring_payment_kind == "monthly_recurring"
    await async_client.patch(
        f"{PREFIX}/settings",
        headers=api_headers,
        json={"apply_recurring_rules_on_upload": False},
    )
    settings = (
        await async_client.get("/api/v1/settings/analytics", headers=api_headers)
    ).json()
    assert settings["effective"]["recurring_dry_run"]["upload_auto_apply"] is False


async def test_legacy_recurring_upload_preference_is_preserved_until_explicit_change(
    async_client: AsyncClient,
    api_headers,
    db_session: AsyncSession,
):
    await seed_recurring(db_session)
    db_session.add(
        AutoClassificationSettings(id=1, apply_recurring_rules_on_upload=True)
    )
    await db_session.commit()
    settings = (
        await async_client.get("/api/v1/settings/analytics", headers=api_headers)
    ).json()
    assert settings["effective"]["recurring_dry_run"]["upload_auto_apply"] is True
    assert settings["saved"]["recurring_dry_run"]["upload_auto_apply"] is None
    await async_client.patch(
        "/api/v1/settings/analytics",
        headers=api_headers,
        json={"recurring_dry_run": {"upload_auto_apply": False}},
    )
    legacy = await async_client.get(f"{PREFIX}/settings", headers=api_headers)
    assert legacy.json()["apply_recurring_rules_on_upload"] is False


async def test_invalid_recurring_settings_are_atomic(
    async_client: AsyncClient,
    api_headers,
):
    for patch in (
        {"monthly_interval_days_min": 40},
        {"weekly_interval_days_max": 5},
        {"default_apply_scope": "future_only"},
    ):
        response = await async_client.patch(
            "/api/v1/settings/analytics",
            headers=api_headers,
            json={"recurring_dry_run": patch},
        )
        assert response.status_code == 422
    settings = (
        await async_client.get("/api/v1/settings/analytics", headers=api_headers)
    ).json()
    assert settings["saved"]["recurring_dry_run"]["monthly_interval_days_min"] is None


@pytest.mark.parametrize("bulk", [False, True])
async def test_partial_classification_edits_preserve_omissions_and_provenance(
    async_client: AsyncClient,
    api_headers,
    db_session: AsyncSession,
    bulk: bool,
):
    row = transaction(
        cost_kind="fixed",
        fixed_cost_necessity="essential",
        spend_necessity="essential",
        cost_classification_source="auto",
        recurring_payment_kind="monthly_recurring",
    )
    db_session.add(row)
    await db_session.commit()
    endpoint = (
        "/api/v1/transactions/bulk-update" if bulk else f"/api/v1/transactions/{row.id}"
    )
    ids = {"ids": [row.id]} if bulk else {}
    for patch in (
        {"memo": "note"},
        {"recurring_payment_kind": "installment"},
        {"cost_kind": None},
        {"cost_kind": "fixed", "spend_necessity": "essential"},
    ):
        response = await async_client.patch(
            endpoint, headers=api_headers, json=ids | patch
        )
        assert response.status_code == 200
        await db_session.refresh(row)
        assert row.cost_classification_source == "auto"
        assert row.spend_necessity == row.fixed_cost_necessity == "essential"
    for value in ("discretionary", "essential", None):
        response = await async_client.patch(
            endpoint, headers=api_headers, json=ids | {"spend_necessity": value}
        )
        assert response.status_code == 200
        await db_session.refresh(row)
        assert row.spend_necessity == row.fixed_cost_necessity == value
        assert row.cost_classification_source == "manual"
        assert row.recurring_payment_kind == "installment"


async def test_category_rules_validate_effective_pairs_and_keep_invalid_rules_deletable(
    async_client: AsyncClient,
    api_headers,
    db_session: AsyncSession,
):
    row = transaction(category_major_user="생활", category_minor_user="통신")
    invalid = CategoryClassificationRule(
        category_major="unknown-marker", cost_kind="variable"
    )
    db_session.add_all([row, invalid])
    await db_session.commit()
    for major, minor in (
        ("unknown-marker", None),
        ("생활", "unknown-minor"),
        ("구독", "서비스"),
        (" ", None),
    ):
        response = await async_client.post(
            f"{PREFIX}/category-rules",
            headers=api_headers,
            json={
                "category_major": major,
                "category_minor": minor,
                "cost_kind": "fixed",
            },
        )
        assert response.status_code == 422
    response = await async_client.post(
        f"{PREFIX}/category-rules",
        headers=api_headers,
        json={"category_major": "생활", "category_minor": "통신", "cost_kind": "fixed"},
    )
    assert response.status_code == 201
    listed = (
        await async_client.get(f"{PREFIX}/category-rules", headers=api_headers)
    ).json()["items"]
    assert (
        next(rule for rule in listed if rule["id"] == invalid.id)["category_valid"]
        is False
    )
    assert (
        await async_client.delete(f"{PREFIX}/category-rules/{invalid.id}")
    ).status_code == 401
    assert (
        await async_client.delete(
            f"{PREFIX}/category-rules/{invalid.id}", headers=api_headers
        )
    ).status_code == 204


async def test_income_expense_filter_and_exact_transaction_detail(
    async_client: AsyncClient,
    db_session: AsyncSession,
):
    rows = [
        transaction(amount=-100),
        transaction(type="수입", amount=1000),
        transaction(type="이체", amount=-500),
    ]
    db_session.add_all(rows)
    await db_session.commit()
    response = await async_client.get(
        "/api/v1/transactions", params={"type": "income_expense"}
    )
    assert response.json()["total"] == 2
    for endpoint in ("summary", "by-category", "by-category/timeline"):
        response = await async_client.get(
            f"/api/v1/transactions/{endpoint}", params={"type": "income_expense"}
        )
        assert response.status_code == 200
        assert sum(item["amount"] for item in response.json()["items"]) == 900
    response = await async_client.get(
        "/api/v1/transactions/summary", params={"type": "all"}
    )
    assert response.json()["items"][0]["amount"] == 400
    detail = await async_client.get(f"/api/v1/transactions/{rows[0].id}")
    assert detail.status_code == 200
    assert detail.json()["id"] == rows[0].id
    assert (await async_client.get("/api/v1/transactions/999999")).status_code == 404


async def test_auto_loan_rule_reassignment_refreshes_both_account_estimates(
    db_session: AsyncSession,
):
    old = LoanAccount(lender="은행 A", product_name="대출 A")
    new = LoanAccount(lender="은행 B", product_name="대출 B")
    rows = [transaction(date=date(2026, month, 5)) for month in (3, 4)]
    snapshots = [
        Loan(
            lender=account.lender,
            product_name=account.product_name,
            snapshot_date=date(2026, 5, 31),
            balance=Decimal("1000000"),
        )
        for account in (old, new)
    ]
    db_session.add_all([old, new, *rows, *snapshots])
    await db_session.flush()
    db_session.add_all(
        [
            LoanTransactionLink(
                transaction_id=row.id,
                loan_account_id=old.id,
                repayment_type="mixed",
                source="auto",
            )
            for row in rows
        ]
    )
    snapshots[0].monthly_payment = Decimal("10000")
    snapshots[0].monthly_payment_source = "estimated_from_linked_transactions"
    db_session.add(
        LoanMerchantRule(
            merchant=rows[0].merchant, loan_account_id=new.id, repayment_type="mixed"
        )
    )
    await db_session.commit()
    result = await apply_loan_merchant_rules(db_session)
    assert result.updated == 2
    await db_session.refresh(snapshots[0])
    await db_session.refresh(snapshots[1])
    assert snapshots[0].monthly_payment is None
    assert snapshots[1].monthly_payment == Decimal("10000")


@pytest.mark.parametrize("bulk", [False, True])
async def test_transaction_delete_restore_refreshes_only_linked_account_estimates(
    async_client: AsyncClient,
    api_headers,
    db_session: AsyncSession,
    bulk: bool,
):
    account = LoanAccount(lender="예시은행", product_name="예시대출")
    rows = [transaction(date=date(2026, month, 5)) for month in (3, 4)]
    snapshot = Loan(
        lender=account.lender,
        product_name=account.product_name,
        snapshot_date=date(2026, 5, 31),
        balance=Decimal("1000000"),
        monthly_payment=Decimal("10000"),
        monthly_payment_source="estimated_from_linked_transactions",
    )
    untouched = Loan(
        lender="다른은행",
        product_name="별도대출",
        snapshot_date=date(2026, 5, 31),
        monthly_payment=Decimal("5000"),
        monthly_payment_source="manual",
    )
    db_session.add_all([account, snapshot, untouched, *rows])
    await db_session.flush()
    db_session.add_all(
        [
            LoanTransactionLink(
                transaction_id=row.id,
                loan_account_id=account.id,
                repayment_type="mixed",
                source="manual",
            )
            for row in rows
        ]
    )
    await db_session.commit()
    if bulk:
        deleted = await async_client.post(
            "/api/v1/transactions/bulk-delete",
            headers=api_headers,
            json={"ids": [rows[0].id]},
        )
        assert deleted.status_code == 200
    else:
        deleted = await async_client.delete(
            f"/api/v1/transactions/{rows[0].id}", headers=api_headers
        )
        assert deleted.status_code == 204
    await db_session.refresh(snapshot)
    assert snapshot.monthly_payment is None
    if bulk:
        restored = await async_client.post(
            "/api/v1/transactions/bulk-restore",
            headers=api_headers,
            json={"ids": [rows[0].id]},
        )
    else:
        restored = await async_client.post(
            f"/api/v1/transactions/{rows[0].id}/restore", headers=api_headers
        )
    assert restored.status_code == 200
    await db_session.refresh(snapshot)
    await db_session.refresh(untouched)
    assert snapshot.monthly_payment == Decimal("10000")
    assert untouched.monthly_payment == Decimal("5000")
    assert untouched.monthly_payment_source == "manual"


async def test_all_matching_approval_rejects_partial_ids_and_fabricated_token(
    async_client: AsyncClient,
    api_headers,
    db_session: AsyncSession,
):
    rows = await seed_recurring(db_session)
    item = (await preview(async_client, api_headers))[0]
    for patch in ({"transaction_ids": [rows[0].id]}, {"preview_token": "0" * 64}):
        response = await async_client.post(
            f"{PREFIX}/apply/recurring-dry-run",
            headers=api_headers,
            json=approval(item, apply_scope="all_matching", **patch),
        )
        assert response.status_code == 409
    for row in rows:
        await db_session.refresh(row)
        assert row.recurring_payment_kind is None


async def test_bulk_delete_restore_refreshes_every_selected_loan_account(
    async_client: AsyncClient,
    api_headers,
    db_session: AsyncSession,
):
    selected_ids = []
    snapshots = []
    expected_payments = []
    for index in (1, 2):
        account = LoanAccount(
            lender=f"예시은행 {index}", product_name=f"예시대출 {index}"
        )
        payment = Decimal(index * 10000)
        rows = [
            transaction(date=date(2026, month, 5), amount=-int(payment))
            for month in (3, 4)
        ]
        snapshot = Loan(
            lender=account.lender,
            product_name=account.product_name,
            snapshot_date=date(2026, 5, 31),
            balance=Decimal("1000000"),
            monthly_payment=payment,
            monthly_payment_source="estimated_from_linked_transactions",
        )
        db_session.add_all([account, snapshot, *rows])
        await db_session.flush()
        db_session.add_all(
            [
                LoanTransactionLink(
                    transaction_id=row.id,
                    loan_account_id=account.id,
                    repayment_type="mixed",
                    source="manual",
                )
                for row in rows
            ]
        )
        selected_ids.append(rows[0].id)
        snapshots.append(snapshot)
        expected_payments.append(payment)
    await db_session.commit()

    for operation, expected in (
        ("delete", [None, None]),
        ("restore", expected_payments),
    ):
        response = await async_client.post(
            f"/api/v1/transactions/bulk-{operation}",
            headers=api_headers,
            json={"ids": selected_ids},
        )
        assert response.status_code == 200
        assert response.json()["updated"] == 2
        for snapshot, payment in zip(snapshots, expected, strict=True):
            await db_session.refresh(snapshot)
            assert snapshot.monthly_payment == payment
        # Repeating the same operation has no matching targets and must be safe.
        repeated = await async_client.post(
            f"/api/v1/transactions/bulk-{operation}",
            headers=api_headers,
            json={"ids": selected_ids},
        )
        assert repeated.status_code == 200
        assert repeated.json()["updated"] == 0


@pytest.mark.parametrize("operation", ["delete", "restore"])
async def test_bulk_delete_restore_with_no_existing_ids_is_safe(
    async_client: AsyncClient,
    api_headers,
    operation: str,
):
    response = await async_client.post(
        f"/api/v1/transactions/bulk-{operation}",
        headers=api_headers,
        json={"ids": [999999]},
    )
    assert response.status_code == 200
    assert response.json()["updated"] == 0
    assert response.json()["preview"]["count"] == 0


@pytest.mark.parametrize("saved_scope", ["future_only", "unsupported_old_scope"])
async def test_legacy_recurring_scope_remains_readable_and_correctable(
    async_client: AsyncClient,
    api_headers,
    db_session: AsyncSession,
    saved_scope: str,
):
    from app.models.app_setting import AppSetting

    await seed_recurring(db_session)
    db_session.add(
        AppSetting(
            scope="analytics.recurring_dry_run",
            key="default_apply_scope",
            value=saved_scope,
        )
    )
    await db_session.commit()
    settings = await async_client.get("/api/v1/settings/analytics", headers=api_headers)
    assert settings.status_code == 200
    assert (
        settings.json()["saved"]["recurring_dry_run"]["default_apply_scope"]
        == saved_scope
    )
    assert (
        settings.json()["effective"]["recurring_dry_run"]["default_apply_scope"]
        == "reviewed_only"
    )
    item = (await preview(async_client, api_headers))[0]
    assert item["default_apply_scope"] == "reviewed_only"
    assert "지원되지 않아" in item["reason"]
    unreviewed = await async_client.post(
        f"{PREFIX}/apply/recurring-dry-run", headers=api_headers, json=approval(item)
    )
    assert unreviewed.status_code == 422
    rejected = await async_client.patch(
        "/api/v1/settings/analytics",
        headers=api_headers,
        json={"recurring_dry_run": {"default_apply_scope": saved_scope}},
    )
    assert rejected.status_code == 422
    corrected = await async_client.patch(
        "/api/v1/settings/analytics",
        headers=api_headers,
        json={"recurring_dry_run": {"default_apply_scope": "all_matching"}},
    )
    assert corrected.status_code == 200
    assert (
        corrected.json()["saved"]["recurring_dry_run"]["default_apply_scope"]
        == "all_matching"
    )


async def test_upload_rechecks_recurring_switch_after_prior_auto_rule_step(
    async_client: AsyncClient,
    api_headers,
    db_session: AsyncSession,
    monkeypatch,
):
    from app.services import auto_classification_service as service
    from app.services.settings_service import patch_analytics_settings

    rows = await seed_recurring(db_session)
    await async_client.patch(
        f"{PREFIX}/settings",
        headers=api_headers,
        json={
            "apply_cost_rules_on_upload": True,
            "apply_recurring_rules_on_upload": True,
        },
    )

    async def earlier_rule_step(session):
        # The preceding rule step commits, allowing the configuration to change
        # before upload recurring classification reaches its serialization point.
        await patch_analytics_settings(
            session,
            spending_anomalies={},
            recurring_dry_run={"upload_auto_apply": False},
        )
        return service.ApplyResult(updated=0)

    monkeypatch.setattr(
        service, "apply_category_classification_rules", earlier_rule_step
    )
    await service.apply_enabled_auto_classification_after_upload(db_session)
    for row in rows:
        await db_session.refresh(row)
        assert row.recurring_payment_kind is None
