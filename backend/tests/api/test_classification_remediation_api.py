from datetime import date, time
from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.auto_classification import (
    LoanMerchantRule,
    RecurringCategoryRule,
)
from app.models.loan import Loan
from app.models.loan_account import LoanAccount
from app.models.loan_transaction_link import LoanTransactionLink
from app.models.transaction import Transaction
from app.services.auto_classification_service import (
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
