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


async def test_discretionary_velocity_follows_adjustability(
    async_client: AsyncClient,
    db_session: AsyncSession,
    api_headers: dict[str, str],
) -> None:
    baseline = [
        _row(date(2026, month, 5), -100_000, merchant="shop-a") for month in (1, 2, 3)
    ]
    current_adjustable = _row(date(2026, 4, 10), -80_000, merchant="shop-a")
    current_protected = _row(
        date(2026, 4, 11), -40_000, merchant="shop-b", category="category-b"
    )
    current_undecided = _row(
        date(2026, 4, 12), -20_000, merchant="shop-c", category="category-c"
    )
    rows = [*baseline, current_adjustable, current_protected, current_undecided]
    db_session.add_all(rows)
    await db_session.commit()

    # Category default for category-a, a transaction-level value for the other.
    response = await async_client.put(
        "/api/v1/nature/category-defaults",
        headers=api_headers,
        json={"category_major": "category-a", "adjustability": "adjustable"},
    )
    assert response.status_code == 200
    await _set_adjustability(
        async_client, api_headers, current_protected.id, "protected"
    )

    response = await async_client.get(
        "/api/v1/analytics/discretionary-velocity",
        params={"as_of_date": "2026-04-15"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["discretionary_spend"] == 80_000
    assert payload["baseline_monthly_spend"] == 100_000
    assert payload["velocity_ratio"] == 1.6
    # protected + adjustable are classified, undecided is not.
    assert payload["classification_coverage_ratio"] == 0.8571
    assert payload["unclassified_spend"] == 20_000
    for transaction in rows:
        await db_session.refresh(transaction)
    _assert_old_columns_empty(rows)

    # Undo the transaction-level value: the row is undecided again, not guessed.
    response = await async_client.delete(
        f"/api/v1/nature/transactions/{current_protected.id}/adjustability",
        headers=api_headers,
    )
    assert response.status_code == 200
    payload = (
        await async_client.get(
            "/api/v1/analytics/discretionary-velocity",
            params={"as_of_date": "2026-04-15"},
        )
    ).json()
    assert payload["unclassified_spend"] == 60_000
    assert payload["classification_coverage_ratio"] == 0.5714


async def test_spending_review_candidates_follow_payment_form_and_adjustability(
    async_client: AsyncClient,
    db_session: AsyncSession,
    api_headers: dict[str, str],
) -> None:
    prior = _row(date(2026, 1, 10), -40_000, merchant="shop-old")
    ad_hoc_adjustable = _row(date(2026, 4, 10), -150_000, merchant="shop-new")
    ad_hoc_protected = _row(date(2026, 4, 11), -150_000, merchant="shop-protected")
    ad_hoc_undecided = _row(date(2026, 4, 12), -150_000, merchant="shop-undecided")
    bundle_member = _row(
        date(2026, 4, 13), -150_000, merchant="service-bundle", category="category-b"
    )
    rows = [
        prior,
        ad_hoc_adjustable,
        ad_hoc_protected,
        ad_hoc_undecided,
        bundle_member,
    ]
    db_session.add_all(rows)
    await db_session.commit()

    await _set_adjustability(async_client, api_headers, prior.id, "adjustable")
    await _set_adjustability(
        async_client, api_headers, ad_hoc_adjustable.id, "adjustable"
    )
    await _set_adjustability(
        async_client, api_headers, ad_hoc_protected.id, "protected"
    )
    # A recurring commitment (정기 지급 묶음) marked adjustable: committed, so it
    # is not an ad hoc purchase to review.
    response = await async_client.post(
        "/api/v1/nature/recurring-commitments",
        headers=api_headers,
        json={
            "match_scope": "merchant",
            "merchant": "service-bundle",
            "category_major": "category-b",
            "cycle": "monthly",
            "adjustability": "adjustable",
        },
    )
    assert response.status_code in (200, 201), response.text
    nature = (
        await async_client.get(
            f"/api/v1/nature/transactions/{bundle_member.id}", headers=api_headers
        )
    ).json()
    assert nature["payment_form"] == "committed"
    assert nature["adjustability"] == "adjustable"

    params = {"start_date": "2026-04-01", "end_date": "2026-04-30"}
    legacy = await async_client.get(
        "/api/v1/analytics/purchase-gate-candidates", params=params
    )
    alias = await async_client.get(
        "/api/v1/analytics/spending-review-candidates", params=params
    )
    assert legacy.status_code == 200
    assert alias.json() == legacy.json()
    payload = legacy.json()
    assert [item["transaction_id"] for item in payload["items"]] == [
        ad_hoc_adjustable.id
    ]
    assert {"large_oneoff", "new_merchant"} <= set(
        payload["items"][0]["candidate_types"]
    )

    review = await async_client.get(
        "/api/v1/read/review-items", params={"period": "2026-04"}, headers=api_headers
    )
    assert review.status_code == 200
    listed = {
        item["transaction_id"]
        for item in review.json()["data"]["items"]
        if item["subject"] == "transaction"
    }
    assert listed == {ad_hoc_adjustable.id}

    for transaction in rows:
        await db_session.refresh(transaction)
    _assert_old_columns_empty(rows)


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
