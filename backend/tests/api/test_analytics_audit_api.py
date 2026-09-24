from datetime import date, time

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.transaction import Transaction


def _expense(day: date, amount: int, merchant: str) -> Transaction:
    return Transaction(
        date=day,
        time=time(10),
        type="지출",
        category_major="생활",
        description=merchant,
        merchant=merchant,
        amount=amount,
        currency="KRW",
        payment_method="카드",
        cost_kind="variable",
        spend_necessity="discretionary",
        source="import",
    )


async def test_all_signal_read_surfaces_accept_explicit_historical_cutoff(
    async_client: AsyncClient, db_session: AsyncSession
) -> None:
    current = _expense(date(2026, 3, 5), -150_000, "현재")
    future = _expense(date(2026, 4, 5), -300_000, "미래")
    db_session.add_all(
        [
            _expense(date(2026, 1, 5), -100_000, "현재"),
            _expense(date(2026, 2, 5), -100_000, "현재"),
            current,
            future,
        ]
    )
    await db_session.flush()
    for endpoint, params, expected in [
        (
            "category-mom",
            {"end_date": "2026-03-15"},
            {
                "reference_date": "2026-03-15",
                "comparison_basis": "same_day_previous_month",
            },
        ),
        (
            "income-stability",
            {"end_date": "2026-03-15"},
            {"reference_date": "2026-03-15", "is_partial_period": True},
        ),
        (
            "spending-anomalies",
            {"end_date": "2026-03-15"},
            {"reference_date": "2026-03-15", "is_partial_period": True},
        ),
        (
            "discretionary-velocity",
            {"as_of_date": "2026-03-15"},
            {"as_of_date": "2026-03-15", "discretionary_spend": 150_000},
        ),
        (
            "spending-review-candidates",
            {"start_date": "2026-03-01", "end_date": "2026-03-15"},
            {"start_date": "2026-03-01", "end_date": "2026-03-15"},
        ),
        (
            "recurring-payments",
            {"end_date": "2026-03-15", "activity": "active", "recent_days": 30},
            {"reference_date": "2026-03-15", "activity": "active", "recent_days": 30},
        ),
    ]:
        response = await async_client.get(
            f"/api/v1/analytics/{endpoint}", params=params
        )
        assert response.status_code == 200
        payload = response.json()
        assert {key: payload[key] for key in expected} == expected
        assert all(item.get("merchant") != "미래" for item in payload.get("items", []))


async def test_recurring_filters_validate_before_querying(
    async_client: AsyncClient,
) -> None:
    for params in [
        {"activity": "subscribed"},
        {"recent_days": 0},
        {"recent_days": 731},
    ]:
        response = await async_client.get(
            "/api/v1/analytics/recurring-payments", params=params
        )
        assert response.status_code == 422


async def test_cancellation_evidence_is_serialized_without_confident_warning(
    async_client: AsyncClient, db_session: AsyncSession
) -> None:
    charge = _expense(date(2026, 3, 5), -150_000, "주유")
    refund = _expense(date(2026, 3, 5), 150_000, "주유")
    db_session.add_all([charge, refund])
    await db_session.flush()
    response = await async_client.get(
        "/api/v1/analytics/spending-review-candidates",
        params={"start_date": "2026-03-01", "end_date": "2026-03-31"},
    )
    assert response.status_code == 200
    item = response.json()["items"][0]
    assert item["possible_cancellation"] is True
    assert item["cancellation_evidence_transaction_ids"] == [charge.id, refund.id]
    assert item["risk_level"] == "unknown"
    assert item["confidence"] == "low"
    assert item["future_friction_suggestion"] is None


async def test_income_expense_filter_excludes_account_movements(
    async_client: AsyncClient, db_session: AsyncSession
) -> None:
    expense = _expense(date(2026, 3, 5), -100, "소비")
    income = _expense(date(2026, 3, 5), 200, "급여")
    income.type = "수입"
    transfer = _expense(date(2026, 3, 5), -999, "카드대금")
    transfer.type = "이체"
    db_session.add_all([expense, income, transfer])
    await db_session.flush()
    response = await async_client.get(
        "/api/v1/analytics/merchant-spend",
        params={"type": "income_expense"},
    )
    assert response.status_code == 200
    assert {item["merchant"] for item in response.json()["items"]} == {"소비", "급여"}
