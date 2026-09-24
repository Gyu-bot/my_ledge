from datetime import date, time
from decimal import Decimal

import pytest

from app.models.asset_snapshot import AssetSnapshot
from app.models.loan import Loan
from app.models.loan_account import LoanAccount
from app.models.loan_transaction_link import LoanTransactionLink
from app.models.transaction import Transaction


async def test_asset_patch_preserves_omitted_fields_and_explicit_tristate(
    async_client, db_session, api_headers
):
    asset = AssetSnapshot(
        snapshot_date=date(2026, 8, 1),
        side="asset",
        category="예금",
        product_name="Cash",
        amount=100,
    )
    db_session.add(asset)
    await db_session.commit()
    url = f"/api/v1/assets/snapshots/{asset.id}/liquidity"
    denied = await async_client.patch(url, json={"is_cash_equivalent": True})
    assert denied.status_code == 401
    response = await async_client.patch(
        url, json={"liquidity_tier": "immediate"}, headers=api_headers
    )
    assert response.status_code == 200
    assert response.json()["is_cash_equivalent"] is None
    for value in (True, False, None):
        response = await async_client.patch(
            url, json={"is_cash_equivalent": value}, headers=api_headers
        )
        assert response.json()["is_cash_equivalent"] is value
        assert response.json()["liquidity_tier"] == "immediate"
    response = await async_client.patch(url, json={}, headers=api_headers)
    assert response.json()["liquidity_tier"] == "immediate"
    assert response.json()["is_cash_equivalent"] is None


async def seed_loan(db_session):
    account = LoanAccount(
        lender="Bank", product_name="Mortgage", loan_kind="equal_principal_interest"
    )
    loan = Loan(
        snapshot_date=date(2026, 9, 23),
        lender="Bank",
        product_name="Mortgage",
        monthly_payment=999,
        monthly_payment_source="manual",
        repayment_method="interest_only",
        repayment_method_source="manual",
    )
    db_session.add_all([account, loan])
    await db_session.flush()
    for month, amount in [(6, -100), (7, -200), (8, -300)]:
        tx = Transaction(
            date=date(2026, month, 5),
            time=time(9),
            type="지출",
            category_major="금융",
            description="repayment",
            merchant="Bank",
            amount=amount,
        )
        db_session.add(tx)
        await db_session.flush()
        db_session.add(
            LoanTransactionLink(
                transaction_id=tx.id,
                loan_account_id=account.id,
                repayment_type="mixed",
            )
        )
    await db_session.commit()
    return loan


async def test_loan_patch_omission_null_and_explicit_automatic_reset(
    async_client, db_session, api_headers
):
    loan = await seed_loan(db_session)
    url = f"/api/v1/loans/{loan.id}/repayment-metadata"
    response = await async_client.patch(
        url, json={"repayment_method": "principal_equal"}, headers=api_headers
    )
    assert response.status_code == 200
    assert Decimal(response.json()["monthly_payment"]) == 999
    assert response.json()["monthly_payment_source"] == "manual"
    response = await async_client.patch(
        url, json={"monthly_payment": None}, headers=api_headers
    )
    assert response.json()["monthly_payment"] is None
    assert response.json()["monthly_payment_source"] == "manual"
    assert response.json()["monthly_payment_missing_reason"] == "manual_value_missing"
    response = await async_client.patch(
        url, json={"monthly_payment_mode": "automatic"}, headers=api_headers
    )
    assert response.status_code == 200
    assert Decimal(response.json()["monthly_payment"]) == 200
    assert (
        response.json()["monthly_payment_source"]
        == "estimated_from_linked_transactions"
    )
    assert response.json()["repayment_method"] == "principal_equal"
    assert response.json()["repayment_method_source"] == "manual"
    assert response.json()["monthly_payment_missing_reason"] is None
    assert response.json()["monthly_payment_observation_months"] == [
        "2026-06",
        "2026-07",
        "2026-08",
    ]
    response = await async_client.patch(
        url, json={"repayment_method_mode": "automatic"}, headers=api_headers
    )
    assert response.status_code == 200
    assert response.json()["repayment_method"] == "principal_interest"
    assert (
        response.json()["repayment_method_source"]
        == "estimated_from_linked_transactions"
    )


@pytest.mark.parametrize(
    "payload",
    [
        {"monthly_payment_mode": "automatic", "monthly_payment": None},
        {"monthly_payment_mode": "automatic", "monthly_payment": 100},
        {"repayment_method_mode": "automatic", "repayment_method": None},
        {"monthly_payment_mode": None},
        {"repayment_method_mode": "manual"},
    ],
)
async def test_loan_reset_rejects_ambiguous_contract(
    async_client, db_session, api_headers, payload
):
    loan = await seed_loan(db_session)
    response = await async_client.patch(
        f"/api/v1/loans/{loan.id}/repayment-metadata", json=payload, headers=api_headers
    )
    assert response.status_code == 422
    await db_session.refresh(loan)
    assert loan.monthly_payment == 999
    assert loan.monthly_payment_source == "manual"


async def test_loan_reset_rejects_historical_target_and_requires_auth(
    async_client, db_session, api_headers
):
    loan = await seed_loan(db_session)
    old_loan = Loan(
        snapshot_date=date(2026, 8, 1),
        lender=loan.lender,
        product_name=loan.product_name,
        monthly_payment=777,
        monthly_payment_source="manual",
    )
    db_session.add(old_loan)
    await db_session.commit()
    url = f"/api/v1/loans/{old_loan.id}/repayment-metadata"
    response = await async_client.patch(url, json={"monthly_payment_mode": "automatic"})
    assert response.status_code == 401
    response = await async_client.patch(
        url, json={"monthly_payment_mode": "automatic"}, headers=api_headers
    )
    assert response.status_code == 409
    await db_session.refresh(old_loan)
    assert old_loan.monthly_payment == 777
