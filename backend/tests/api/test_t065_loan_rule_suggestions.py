"""Synthetic rule suggestions are available even when upload linking is disabled."""

from datetime import date, time

from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.auto_classification import AutoClassificationSettings, LoanMerchantRule
from app.models.loan_account import LoanAccount
from app.models.loan_transaction_link import LoanTransactionLink
from app.models.transaction import Transaction


async def test_disabled_upload_toggle_still_shows_rule_matched_nonkeyword_candidate(
    async_client: AsyncClient, db_session: AsyncSession
) -> None:
    account = LoanAccount(lender="합성기관", product_name="합성상품")
    description_account = LoanAccount(lender="합성기관B", product_name="합성상품B")
    db_session.add_all([account, description_account])
    await db_session.flush()
    transaction = Transaction(
        date=date(2026, 5, 1),
        time=time(9),
        type="지출",
        category_major="기타",
        description="합성원문",
        merchant="합성거래처",
        amount=-12345,
        currency="KRW",
        source="import",
    )
    db_session.add_all(
        [
            transaction,
            AutoClassificationSettings(id=1, apply_loan_rules_on_upload=False),
            LoanMerchantRule(
                merchant="합성거래처",
                match_field="merchant",
                loan_account_id=account.id,
                repayment_type="mixed",
            ),
            LoanMerchantRule(
                merchant="합성원문",
                match_field="description",
                loan_account_id=description_account.id,
                repayment_type="interest",
            ),
        ]
    )
    await db_session.commit()

    response = await async_client.get("/api/v1/loan-transaction-links?linked=unlinked")

    assert response.status_code == 200
    assert response.json()["total"] == 1
    item = response.json()["items"][0]
    assert item["transaction_id"] == transaction.id
    assert item["link"] is None
    assert item["suggested_loan_account_id"] == account.id
    assert item["suggestion_basis"] == "rule"
    assert (
        await db_session.scalar(select(func.count()).select_from(LoanTransactionLink))
        == 0
    )

    # The description rule remains visible after removing the higher-precedence
    # merchant rule; manual mappings continue to own their existing account.
    merchant_rule = await db_session.scalar(
        select(LoanMerchantRule).where(LoanMerchantRule.match_field == "merchant")
    )
    await db_session.delete(merchant_rule)
    await db_session.commit()
    by_description = await async_client.get("/api/v1/loan-transaction-links")
    assert (
        by_description.json()["items"][0]["suggested_loan_account_id"]
        == description_account.id
    )
    db_session.add(
        LoanTransactionLink(
            transaction_id=transaction.id,
            loan_account_id=account.id,
            repayment_type="mixed",
            source="manual",
        )
    )
    await db_session.commit()
    linked = (await async_client.get("/api/v1/loan-transaction-links")).json()["items"][
        0
    ]
    assert linked["link"]["loan_account_id"] == account.id
    assert linked["suggested_loan_account_id"] is None
    assert linked["suggestion_basis"] is None
