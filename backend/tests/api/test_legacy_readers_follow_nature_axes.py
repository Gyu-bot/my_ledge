"""Readers that used the old classification columns follow the T056 axes.

Every classification here is set only through the nature API (category
default, recurring commitment, transaction adjustability); the old columns
``cost_kind``/``fixed_cost_necessity``/``spend_necessity``/
``recurring_payment_kind`` stay empty. Synthetic data only.
"""

from datetime import date, time

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.loan_account import LoanAccount
from app.models.loan_transaction_link import LoanTransactionLink
from app.models.transaction import Transaction


def _row(
    day: date,
    amount: int,
    *,
    merchant: str,
    category: str = "category-a",
    tx_type: str = "지출",
) -> Transaction:
    return Transaction(
        date=day,
        time=time(10, 0),
        type=tx_type,
        category_major=category,
        description=merchant,
        merchant=merchant,
        amount=amount,
        currency="KRW",
        payment_method="card-a",
        source="import",
    )


def _assert_old_columns_empty(transactions: list[Transaction]) -> None:
    for transaction in transactions:
        assert transaction.cost_kind is None
        assert transaction.fixed_cost_necessity is None
        assert transaction.spend_necessity is None
        assert transaction.recurring_payment_kind is None


async def _set_adjustability(
    client: AsyncClient, headers: dict[str, str], transaction_id: int, value: str
) -> None:
    response = await client.put(
        f"/api/v1/nature/transactions/{transaction_id}/adjustability",
        headers=headers,
        json={"adjustability": value},
    )
    assert response.status_code == 200, response.text
    assert response.json()["adjustability"] == value


async def test_liquidity_required_spend_follows_protected(
    async_client: AsyncClient,
    db_session: AsyncSession,
    api_headers: dict[str, str],
) -> None:
    income = [
        _row(date(2026, month, 25), 3_000_000, merchant="payer-a", tx_type="수입")
        for month in (2, 3)
    ]
    rent = _row(date(2026, 4, 5), -700_000, merchant="landlord-a")
    leisure = _row(date(2026, 4, 6), -200_000, merchant="shop-a")
    undecided = _row(date(2026, 4, 7), -100_000, merchant="shop-b")
    repayment = _row(date(2026, 4, 10), -300_000, merchant="lender-a")
    rows = [*income, rent, leisure, undecided, repayment]
    account = LoanAccount(lender="lender-a", product_name="loan-a")
    db_session.add_all([*rows, account])
    await db_session.flush()
    db_session.add(
        LoanTransactionLink(transaction_id=repayment.id, loan_account_id=account.id)
    )
    await db_session.commit()

    await _set_adjustability(async_client, api_headers, rent.id, "protected")
    await _set_adjustability(async_client, api_headers, leisure.id, "adjustable")

    response = await async_client.get(
        "/api/v1/analytics/liquidity-health",
        params={"snapshot_date": "2026-04-30"},
    )

    assert response.status_code == 200
    payload = response.json()
    # protected rent + the loan repayment (fixed protected); adjustable and
    # undecided spend are not required spend.
    assert payload["monthly_required_spend"] == "1000000.00"
    assert payload["required_spend_essential_total"] == "1000000.00"
    assert payload["required_spend_additional_debt_total"] == "0.00"
    for transaction in rows:
        await db_session.refresh(transaction)
    _assert_old_columns_empty(rows)
