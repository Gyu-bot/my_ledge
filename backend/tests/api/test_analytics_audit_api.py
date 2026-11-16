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
    async_client: AsyncClient,
    db_session: AsyncSession,
    sync_legacy_classification,
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
    await sync_legacy_classification()
    for endpoint, params, expected in [
        (
            "income-stability",
            {"end_date": "2026-03-15"},
            {"reference_date": "2026-03-15", "is_partial_period": True},
        ),
    ]:
        response = await async_client.get(
            f"/api/v1/analytics/{endpoint}", params=params
        )
        assert response.status_code == 200
        payload = response.json()
        assert {key: payload[key] for key in expected} == expected
        assert all(item.get("merchant") != "미래" for item in payload.get("items", []))


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
