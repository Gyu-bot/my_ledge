from datetime import date, time
from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.app_setting import AppSetting
from app.models.loan import Loan
from app.models.loan_account import LoanAccount
from app.models.loan_transaction_link import LoanTransactionLink
from app.models.transaction import Transaction
from app.schemas.loan_mapping import (
    LoanAccountMetadataUpdateRequest,
    LoanTransactionLinkBulkUpsertRequest,
)
from app.services.loan_mapping_service import (
    bulk_upsert_transaction_loan_links,
    get_loan_repayment_estimate_metadata,
    update_loan_account_metadata,
)


def _repayment(tx_date: date, amount: int) -> Transaction:
    return Transaction(
        date=tx_date,
        time=time(9),
        type="지출",
        category_major="금융",
        category_minor="대출상환",
        description="상환",
        merchant="은행",
        amount=amount,
        currency="KRW",
    )


async def test_recalculate_endpoint_repairs_only_explicit_manual_null_and_preserves_manual(
    async_client: AsyncClient,
    api_headers: dict[str, str],
    db_session: AsyncSession,
) -> None:
    accounts = [LoanAccount(lender="은행", product_name=str(i)) for i in range(4)]
    loans = [
        Loan(
            lender="은행",
            product_name=str(i),
            snapshot_date=date(2026, 5, 15),
            monthly_payment=value,
            monthly_payment_source=source,
            repayment_method="interest_only",
            repayment_method_source="manual",
        )
        for i, (value, source) in enumerate(
            [
                (None, "manual"),
                (Decimal("0"), "manual"),
                (Decimal("900"), "manual"),
                (Decimal("1"), "estimated_from_linked_transactions"),
            ]
        )
    ]
    db_session.add_all(
        [
            *accounts,
            *loans,
            AppSetting(
                scope="analytics.asset_liability_health",
                key="monthly_payment_min_observations",
                value="2",
            ),
        ]
    )
    await db_session.flush()
    for account in accounts:
        for tx_date, amount in [(date(2026, 3, 10), -100), (date(2026, 4, 10), -300)]:
            tx = _repayment(tx_date, amount)
            db_session.add(tx)
            await db_session.flush()
            db_session.add(
                LoanTransactionLink(
                    transaction_id=tx.id,
                    loan_account_id=account.id,
                    repayment_type="mixed",
                    source="manual",
                )
            )
    await db_session.commit()
    payload = {"loan_account_ids": [account.id for account in accounts]}
    unauthorized = await async_client.post(
        "/api/v1/loan-accounts/recalculate-estimates", json=payload
    )
    assert unauthorized.status_code in {401, 403}
    response = await async_client.post(
        "/api/v1/loan-accounts/recalculate-estimates", headers=api_headers, json=payload
    )
    assert response.status_code == 200
    by_id = {item["loan_account_id"]: item for item in response.json()["items"]}
    assert by_id[accounts[0].id]["monthly_payment"] is None
    assert (
        by_id[accounts[0].id]["monthly_payment_missing_reason"]
        == "manual_value_missing"
    )
    assert Decimal(by_id[accounts[3].id]["monthly_payment"]) == 200

    repaired = await async_client.post(
        "/api/v1/loan-accounts/recalculate-estimates",
        headers=api_headers,
        json={**payload, "reset_invalid_manual_null": True},
    )
    assert repaired.status_code == 200
    for loan, expected in zip(loans, [200, 0, 900, 200], strict=True):
        await db_session.refresh(loan)
        assert loan.monthly_payment == Decimal(expected)
        assert loan.repayment_method == "interest_only"
        assert loan.repayment_method_source == "manual"
    assert loans[0].monthly_payment_source == "estimated_from_linked_transactions"
    assert loans[1].monthly_payment_source == "manual"
    assert loans[2].monthly_payment_source == "manual"
    metadata = repaired.json()["items"][0]
    assert metadata["monthly_payment_observation_months"] == ["2026-03", "2026-04"]
    assert metadata["monthly_payment_estimate_window_end"] == "2026-04-30"
    assert (
        metadata["monthly_payment_estimate_basis"]
        == "median_closed_month_linked_repayments"
    )
    assert metadata["monthly_payment_min_observations"] == 2


@pytest.mark.parametrize(
    "dates,source,expected",
    [
        ([], None, "no_linked_transactions"),
        ([date(2026, 5, 10)], None, "current_month_excluded"),
        ([date(2024, 1, 10)], None, "no_observations_in_window"),
        ([date(2026, 4, 10)], None, "insufficient_observations"),
        ([date(2026, 3, 10), date(2026, 4, 10)], None, "recalculation_required"),
        ([date(2026, 3, 10), date(2026, 4, 10)], "manual", "manual_value_missing"),
    ],
)
async def test_estimate_metadata_reports_why_missing_without_writing(
    db_session: AsyncSession,
    dates: list[date],
    source: str | None,
    expected: str,
) -> None:
    account = LoanAccount(lender="은행", product_name="대출")
    loan = Loan(
        lender="은행",
        product_name="대출",
        snapshot_date=date(2026, 5, 15),
        monthly_payment_source=source,
    )
    db_session.add_all(
        [
            account,
            loan,
            AppSetting(
                scope="analytics.asset_liability_health",
                key="monthly_payment_min_observations",
                value="2",
            ),
        ]
    )
    await db_session.flush()
    for tx_date in dates:
        tx = _repayment(tx_date, -100)
        db_session.add(tx)
        await db_session.flush()
        db_session.add(
            LoanTransactionLink(transaction_id=tx.id, loan_account_id=account.id)
        )
    await db_session.commit()
    result = await get_loan_repayment_estimate_metadata(db_session, loan)
    assert result["monthly_payment_missing_reason"] == expected
    await db_session.refresh(loan)
    assert loan.monthly_payment is None
    assert loan.monthly_payment_source == source


async def test_bulk_move_recalculates_both_accounts_and_kind_changes_formula(
    db_session: AsyncSession,
) -> None:
    old_account = LoanAccount(lender="은행", product_name="기존")
    new_account = LoanAccount(lender="은행", product_name="새계좌")
    old_loan = Loan(lender="은행", product_name="기존", snapshot_date=date(2026, 5, 15))
    new_loan = Loan(
        lender="은행", product_name="새계좌", snapshot_date=date(2026, 5, 15)
    )
    txs = [
        _repayment(date(2026, month, 10), -amount)
        for month, amount in [(2, 100), (3, 200), (4, 600)]
    ]
    db_session.add_all([old_account, new_account, old_loan, new_loan, *txs])
    await db_session.commit()
    for account in [old_account, new_account]:
        await bulk_upsert_transaction_loan_links(
            db_session,
            LoanTransactionLinkBulkUpsertRequest(
                transaction_ids=[tx.id for tx in txs],
                loan_account_id=account.id,
                repayment_type="mixed",
            ),
        )
    await db_session.refresh(old_loan)
    await db_session.refresh(new_loan)
    assert old_loan.monthly_payment is None
    assert old_loan.monthly_payment_source is None
    assert new_loan.monthly_payment == 200
    await update_loan_account_metadata(
        db_session,
        LoanAccountMetadataUpdateRequest(
            loan_account_id=new_account.id,
            loan_kind="overdraft",
        ),
    )
    await db_session.refresh(new_loan)
    assert new_loan.monthly_payment == 300


async def test_recalculate_validates_all_targets_before_resetting(
    async_client: AsyncClient,
    api_headers: dict[str, str],
    db_session: AsyncSession,
) -> None:
    account = LoanAccount(lender="은행", product_name="대출")
    empty = LoanAccount(lender="은행", product_name="스냅샷없음")
    loan = Loan(
        lender="은행",
        product_name="대출",
        snapshot_date=date(2026, 5, 15),
        monthly_payment_source="manual",
    )
    db_session.add_all([account, empty, loan])
    await db_session.commit()
    response = await async_client.post(
        "/api/v1/loan-accounts/recalculate-estimates",
        headers=api_headers,
        json={
            "loan_account_ids": [account.id, empty.id],
            "reset_invalid_manual_null": True,
        },
    )
    assert response.status_code == 409
    await db_session.refresh(loan)
    assert loan.monthly_payment_source == "manual"
