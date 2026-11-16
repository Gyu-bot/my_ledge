"""Synthetic comparison-contract scenarios (T057). No real financial data.

Each scenario takes a session and an HTTP client bound to it so the same
assertions run on SQLite (``test_comparison_contract.py``) and on PostgreSQL
views created by ``alembic upgrade head`` (``test_comparison_postgresql.py``).
"""

from datetime import date, time

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.transaction import Transaction
from app.services.nature_axes_service import write_through_legacy_classification

HEADERS = {"X-API-Key": "test-api-key"}


def tx(
    tx_date: date,
    amount: int,
    *,
    category: str = "category-a",
    merchant: str = "merchant-a",
    tx_type: str = "지출",
    spend_necessity: str | None = None,
) -> Transaction:
    return Transaction(
        date=tx_date,
        time=time(12, 0),
        type=tx_type,
        category_major=category,
        category_minor=None,
        description=merchant,
        merchant=merchant,
        amount=amount,
        currency="KRW",
        payment_method="card-a",
        spend_necessity=spend_necessity,
    )


async def add(session: AsyncSession, rows: list[Transaction]) -> None:
    session.add_all(rows)
    await session.commit()
    # T056: legacy necessity reaches the views through the two-axis tables.
    await write_through_legacy_classification(session, [row.id for row in rows])
    await session.commit()


async def get(client: AsyncClient, path: str, **params: object) -> dict:
    response = await client.get(
        f"/api/v1{path}",
        params={key: value for key, value in params.items() if value is not None},
        headers=HEADERS,
    )
    assert response.status_code == 200, response.text
    return response.json()


async def set_baseline_start(client: AsyncClient, value: str | None) -> dict:
    response = await client.patch(
        "/api/v1/settings/analytics",
        json={"comparison": {"baseline_start_date": value}},
        headers=HEADERS,
    )
    assert response.status_code == 200, response.text
    return response.json()


def measure(payload: dict, key: str) -> dict:
    return next(item for item in payload["measures"] if item["key"] == key)


def item(payload: dict, category: str, merchant: str | None = None) -> dict:
    return next(
        row
        for row in payload["items"] + payload["twelve_month_items"]
        if row["category"] == category and row["merchant"] == merchant
    )


# --------------------------------------------------------------------------
# Scenario: median with an even month count and fewer than 6 closed months.
# --------------------------------------------------------------------------


async def scenario_even_median_fewer_than_six(
    session: AsyncSession, client: AsyncClient
) -> None:
    await add(
        session,
        [
            tx(date(2026, 1, 1), -100_000),
            tx(date(2026, 2, 3), -300_000),
            tx(date(2026, 3, 3), -200_001),
            tx(date(2026, 4, 3), -400_001),
            tx(date(2026, 5, 3), -1_000_000),
            tx(date(2026, 5, 31), -1, category="category-z"),
        ],
    )
    payload = await get(client, "/metrics/comparison/monthly-flow")
    basis = payload["comparison"]
    assert basis["target_period"] == "2026-05"
    assert basis["target_month_status"] == "closed"
    assert basis["partial_month_handling"] == "closed_month_full"
    assert basis["baseline_periods"] == ["2026-01", "2026-02", "2026-03", "2026-04"]
    assert basis["baseline_month_count"] == 4
    assert basis["baseline_months_requested"] == 6
    assert basis["baseline_status"] == "fewer_than_requested"
    assert basis["baseline_limited_by"] == "data_start"
    assert basis["ratio_metrics_available"] is True
    outflow = measure(payload, "total_outflow")
    # Even count: (200_001 + 300_000) / 2 = 250_000.5, rounded half up.
    assert [value["amount"] for value in outflow["baseline_values"]] == [
        100_000,
        300_000,
        200_001,
        400_001,
    ]
    assert outflow["baseline_amount"] == 250_001
    assert outflow["target_amount"] == 1_000_001
    assert outflow["change_amount"] == 750_000
    assert payload["residual_rate"] is not None


# --------------------------------------------------------------------------
# Scenario: a first data month that starts mid-month is not a baseline month.
# --------------------------------------------------------------------------


async def scenario_partial_first_month_excluded(
    session: AsyncSession, client: AsyncClient
) -> None:
    await add(
        session,
        [
            tx(date(2026, 1, 12), -900_000),
            tx(date(2026, 2, 3), -300_000),
            tx(date(2026, 3, 3), -200_000),
            tx(date(2026, 4, 3), -400_000),
            tx(date(2026, 4, 30), -1, category="category-z"),
        ],
    )
    payload = await get(client, "/metrics/comparison/monthly-flow")
    basis = payload["comparison"]
    assert basis["target_period"] == "2026-04"
    assert basis["first_data_period"] == "2026-01"
    assert basis["first_data_period_starts_mid_month"] is True
    assert basis["baseline_periods"] == ["2026-02", "2026-03"]
    assert basis["baseline_status"] == "fewer_than_requested"
    assert basis["baseline_limited_by"] == "data_start"
    assert "2026-01" not in (basis["partial_month_note"] or "")
    outflow = measure(payload, "total_outflow")
    assert outflow["baseline_amount"] == 250_000

    # The month right after the partial first month has no baseline at all.
    second = await get(client, "/metrics/comparison/monthly-flow", period="2026-02")
    assert second["comparison"]["baseline_periods"] == []
    assert second["comparison"]["baseline_status"] == "none"
    assert measure(second, "total_outflow")["baseline_amount"] is None


# --------------------------------------------------------------------------
# Scenario: in-progress month (same elapsed days, no ratio, no full-month
# delta) across the new surface and the legacy analytics.
# --------------------------------------------------------------------------


async def scenario_in_progress_month(
    session: AsyncSession, client: AsyncClient
) -> None:
    rows = []
    for month in (3, 4, 5):
        rows += [
            tx(date(2026, month, 5), -100_000, spend_necessity="discretionary"),
            tx(date(2026, month, 20), -200_000, spend_necessity="discretionary"),
            tx(date(2026, month, 25), 3_000_000, tx_type="수입", category="income"),
        ]
    rows += [
        tx(date(2026, 3, 1), -1, category="category-z"),
        tx(date(2026, 6, 5), -150_000, spend_necessity="discretionary"),
        tx(date(2026, 6, 10), -5_000, category="category-b", merchant="merchant-b"),
    ]
    rows += [tx(date(2026, 5, 31), -1, category="category-z")]
    await add(session, rows)

    payload = await get(client, "/metrics/comparison/monthly-flow")
    basis = payload["comparison"]
    # Default target is the latest closed month; ask for the in-progress one.
    assert basis["target_period"] == "2026-05"
    payload = await get(client, "/metrics/comparison/monthly-flow", period="2026-06")
    basis = payload["comparison"]
    assert basis["target_month_status"] == "in_progress"
    assert basis["target_end_date"] == "2026-06-10"
    assert basis["partial_month_handling"] == "same_elapsed_days"
    assert basis["elapsed_day"] == 10
    assert basis["ratio_metrics_available"] is False
    assert basis["previous_full_month_delta_available"] is False
    assert basis["baseline_periods"] == ["2026-03", "2026-04", "2026-05"]
    outflow = measure(payload, "total_outflow")
    # Baseline months are cut at day 10: only the day-5 charge (100_000) counts
    # (March also has a 1-won row on day 1).
    assert [value["amount"] for value in outflow["baseline_values"]] == [
        100_001,
        100_000,
        100_000,
    ]
    assert outflow["baseline_amount"] == 100_000
    assert outflow["target_amount"] == 155_000
    assert outflow["change_amount"] == 55_000
    income = measure(payload, "income_total")
    assert income["baseline_amount"] == 0
    assert income["target_amount"] == 0
    assert payload["residual_rate"] is None

    contributions = await get(
        client, "/metrics/comparison/contributions", period="2026-06"
    )
    assert contributions["comparison"]["elapsed_day"] == 10
    assert item(contributions, "category-a")["baseline_amount"] == 100_000
    assert item(contributions, "category-a")["change_amount"] == 50_000
    assert contributions["target_total"] == 155_000

    flow = await get(client, "/metrics/monthly-flow", start_period="2026-06")
    assert flow["items"][0]["month_status"] == "in_progress"
    assert flow["items"][0]["residual_rate"] is None

    cashflow = (await client.get("/api/v1/analytics/monthly-cashflow")).json()
    rates = {row["period"]: row["savings_rate"] for row in cashflow["items"]}
    assert rates["2026-06"] is None
    assert rates["2026-05"] is not None

    trend = (await client.get("/api/v1/analytics/fixed-cost-trend")).json()
    ratios = {row["period"]: row["fixed_ratio"] for row in trend["items"]}
    assert ratios["2026-06"] is None


# --------------------------------------------------------------------------
# Scenario: a month with no data vs a month with a zero amount.
# --------------------------------------------------------------------------


async def scenario_no_data_vs_zero(session: AsyncSession, client: AsyncClient) -> None:
    other = {"category": "category-other", "merchant": "merchant-o"}
    await add(
        session,
        [
            tx(date(2026, 1, 1), -100_000),
            tx(date(2026, 1, 9), -10_000, **other),
            # February has data but nothing in category-a: a zero month.
            tx(date(2026, 2, 9), -10_000, **other),
            # March has no transactions at all: a no-data month.
            tx(date(2026, 4, 9), -100_000),
            tx(date(2026, 4, 10), -10_000, **other),
            tx(date(2026, 5, 9), -10_000, **other),
            tx(date(2026, 6, 9), -100_000),
            tx(date(2026, 6, 30), -10_000, **other),
        ],
    )
    payload = await get(client, "/metrics/comparison/contributions")
    basis = payload["comparison"]
    assert basis["target_period"] == "2026-06"
    assert basis["baseline_periods"] == ["2026-01", "2026-02", "2026-04", "2026-05"]
    assert basis["skipped_periods"] == [{"period": "2026-03", "reason": "no_data"}]
    row = item(payload, "category-a")
    # [100_000, 0, 100_000, 0] -> 50_000. Counting March as 0 would give 0.
    assert row["baseline_amount"] == 50_000
    assert row["baseline_zero_month_count"] == 2
    assert row["baseline_observed_month_count"] == 2
    assert row["change_amount"] == 50_000

    gap = await get(client, "/metrics/comparison/monthly-flow", period="2026-03")
    assert gap["comparison"]["target_coverage"] == "no_data"
    assert measure(gap, "total_outflow")["target_amount"] is None
    assert measure(gap, "total_outflow")["change_amount"] is None
    assert measure(gap, "total_outflow")["baseline_amount"] == 60_000

    zero_month = await get(
        client, "/metrics/comparison/contributions", period="2026-05"
    )
    assert zero_month["comparison"]["target_coverage"] == "observed"
    assert zero_month["comparison"]["baseline_periods"] == [
        "2026-01",
        "2026-02",
        "2026-04",
    ]
    zero_row = item(zero_month, "category-a")
    # The target month has data, so category-a is 0 won there, not missing.
    assert zero_row["target_amount"] == 0
    assert zero_row["baseline_amount"] == 100_000
    assert zero_row["change_amount"] == -100_000

    future = await client.get(
        "/api/v1/metrics/comparison/monthly-flow",
        params={"period": "2026-08"},
        headers=HEADERS,
    )
    assert future.status_code == 422


# --------------------------------------------------------------------------
# Scenario: changing the baseline start date changes every comparison.
# --------------------------------------------------------------------------


async def scenario_baseline_start_date(
    session: AsyncSession, client: AsyncClient
) -> None:
    rows = []
    for month, amount in enumerate(
        (100_000, 100_000, 100_000, 100_000, 400_000, 400_000, 400_000, 500_000),
        start=1,
    ):
        rows.append(tx(date(2026, month, 1 if month == 1 else 10), -amount))
    rows.append(tx(date(2026, 8, 31), -1, category="category-z"))
    await add(session, rows)

    async def snapshot() -> dict[str, object]:
        flow = await get(client, "/metrics/comparison/monthly-flow")
        contributions = await get(client, "/metrics/comparison/contributions")
        return {
            "periods": {
                tuple(flow["comparison"]["baseline_periods"]),
                tuple(contributions["comparison"]["baseline_periods"]),
            },
            "start": {
                flow["comparison"]["baseline_start_date"],
                contributions["comparison"]["baseline_start_date"],
            },
            "baseline": {
                measure(flow, "total_outflow")["baseline_amount"],
                item(contributions, "category-a")["baseline_amount"],
            },
        }

    default = await snapshot()
    assert default["periods"] == {
        ("2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07")
    }
    assert default["start"] == {None}
    # [100, 100, 100, 400, 400, 400] thousand -> 250_000
    assert default["baseline"] == {250_000}

    settings = await set_baseline_start(client, "2026-05-15")
    assert settings["effective"]["comparison"]["baseline_start_date"] == "2026-05-15"
    changed = await snapshot()
    assert changed["periods"] == {("2026-06", "2026-07")}
    assert changed["start"] == {"2026-05-15"}
    assert changed["baseline"] == {400_000}
    flow = await get(client, "/metrics/comparison/monthly-flow")
    assert flow["comparison"]["baseline_start_period"] == "2026-06"
    assert flow["comparison"]["baseline_limited_by"] == "baseline_start_date"

    await set_baseline_start(client, "2026-05-01")
    first_day = await get(client, "/metrics/comparison/monthly-flow")
    assert first_day["comparison"]["baseline_periods"] == [
        "2026-05",
        "2026-06",
        "2026-07",
    ]

    await set_baseline_start(client, None)
    assert await snapshot() == default


# --------------------------------------------------------------------------
# Scenario: contributions ordered by won, split by all/protected/adjustable,
# and merchants kept inside their category.
# --------------------------------------------------------------------------


async def scenario_contribution_ordering(
    session: AsyncSession, client: AsyncClient
) -> None:
    protected = {"category": "category-p", "spend_necessity": "essential"}
    adjustable = {"category": "category-j", "spend_necessity": "discretionary"}
    undecided = {"category": "category-u"}
    rows = [tx(date(2026, 1, 1), 0, category="category-z")]
    for month in (1, 2, 3):
        rows += [
            tx(date(2026, month, 2), -700_000, merchant="merchant-p1", **protected),
            tx(date(2026, month, 3), -300_000, merchant="merchant-p2", **protected),
            tx(date(2026, month, 4), -10_000, merchant="merchant-j", **adjustable),
            tx(date(2026, month, 5), -20_000, merchant="merchant-p1", **undecided),
        ]
    rows += [
        # Target 2026-04: category-p +50_000 (merchant-p1 +70_000, merchant-p2
        # −20_000), category-j +30_000 (+300%), category-u +80_000 (+400%).
        tx(date(2026, 4, 2), -770_000, merchant="merchant-p1", **protected),
        tx(date(2026, 4, 3), -280_000, merchant="merchant-p2", **protected),
        tx(date(2026, 4, 4), -40_000, merchant="merchant-j", **adjustable),
        tx(date(2026, 4, 5), -100_000, merchant="merchant-p1", **undecided),
        tx(date(2026, 4, 30), 0, category="category-z"),
    ]
    await add(session, rows)

    everything = await get(client, "/metrics/comparison/contributions")
    assert everything["comparison"]["target_period"] == "2026-04"
    assert everything["ordering"] == "abs_change_amount_desc"
    assert [row["category"] for row in everything["items"]] == [
        "category-u",
        "category-p",
        "category-j",
    ]
    assert [row["change_amount"] for row in everything["items"]] == [
        80_000,
        50_000,
        30_000,
    ]
    assert everything["change_total"] == 160_000

    protected_view = await get(
        client, "/metrics/comparison/contributions", adjustability="protected"
    )
    assert protected_view["adjustability"] == "protected"
    assert [row["category"] for row in protected_view["items"]] == ["category-p"]
    assert protected_view["change_total"] == 50_000

    adjustable_view = await get(
        client, "/metrics/comparison/contributions", adjustability="adjustable"
    )
    assert [row["category"] for row in adjustable_view["items"]] == ["category-j"]
    assert adjustable_view["change_total"] == 30_000

    merchants = await get(
        client,
        "/metrics/comparison/contributions",
        level="merchant",
        category="category-p",
    )
    assert [(row["merchant"], row["change_amount"]) for row in merchants["items"]] == [
        ("merchant-p1", 70_000),
        ("merchant-p2", -20_000),
    ]
    # The same merchant name under two categories is counted separately.
    all_merchants = await get(
        client, "/metrics/comparison/contributions", level="merchant"
    )
    assert [
        (row["category"], row["merchant"], row["change_amount"])
        for row in all_merchants["items"]
    ] == [
        ("category-u", "merchant-p1", 80_000),
        ("category-p", "merchant-p1", 70_000),
        ("category-j", "merchant-j", 30_000),
        ("category-p", "merchant-p2", -20_000),
    ]


# --------------------------------------------------------------------------
# Scenario: a once-a-year expense is compared over a 12-month window.
# --------------------------------------------------------------------------


async def scenario_annual_expense(session: AsyncSession, client: AsyncClient) -> None:
    rows = []
    year, month = 2024, 1
    while (year, month) <= (2026, 4):
        rows.append(
            tx(date(year, month, 1), -100_000, category="category-g", merchant="g")
        )
        month += 1
        if month == 13:
            year, month = year + 1, 1
    annual = {"category": "category-annual", "merchant": "annual-payee"}
    rows += [
        tx(date(2025, 3, 15), -600_000, **annual),
        tx(date(2026, 3, 15), -630_000, **annual),
        tx(date(2026, 4, 30), -1, category="category-z"),
    ]
    await add(session, rows)

    payload = await get(client, "/metrics/comparison/contributions", period="2026-03")
    window = payload["twelve_month_window"]
    assert window["target_window_start_period"] == "2025-04"
    assert window["target_window_end_period"] == "2026-03"
    assert window["baseline_window_start_period"] == "2024-04"
    assert window["baseline_window_end_period"] == "2025-03"
    assert window["target_window_complete"] is True
    assert window["baseline_window_available"] is True
    annual_row = item(payload, "category-annual")
    assert annual_row["cadence"] == "annual_like"
    assert annual_row["window"] == "twelve_month"
    assert annual_row["active_months_in_window"] == 1
    assert annual_row["target_amount"] == 630_000
    assert annual_row["target_period_amount"] == 630_000
    assert annual_row["baseline_amount"] == 600_000
    assert annual_row["change_amount"] == 30_000
    # The monthly comparison would have shown +630_000 against a 0 median.
    assert [(row["category"], row["change_amount"]) for row in payload["items"]] == [
        ("category-g", 0)
    ]

    await set_baseline_start(client, "2025-06-01")
    limited = await get(client, "/metrics/comparison/contributions", period="2026-03")
    window = limited["twelve_month_window"]
    assert window["baseline_window_available"] is False
    assert window["baseline_window_unavailable_reason"] == "baseline_start_date"
    annual_row = item(limited, "category-annual")
    assert annual_row["baseline_amount"] is None
    assert annual_row["change_amount"] is None
    assert annual_row["baseline_note"]
    await set_baseline_start(client, None)


async def scenario_annual_expense_short_history(
    session: AsyncSession, client: AsyncClient
) -> None:
    rows = [
        tx(date(2025, month, 1), -100_000, category="category-g", merchant="g")
        for month in range(5, 13)
    ] + [
        tx(date(2026, month, 1), -100_000, category="category-g", merchant="g")
        for month in range(1, 5)
    ]
    rows += [
        tx(date(2026, 3, 15), -630_000, category="category-annual"),
        tx(date(2026, 4, 30), -1, category="category-z"),
    ]
    await add(session, rows)
    payload = await get(client, "/metrics/comparison/contributions")
    window = payload["twelve_month_window"]
    assert window["target_window_start_period"] == "2025-05"
    assert window["target_window_complete"] is True
    assert window["baseline_window_unavailable_reason"] == "data_start"
    annual_row = item(payload, "category-annual")
    assert annual_row["cadence"] == "annual_like"
    assert annual_row["target_amount"] == 630_000
    assert annual_row["target_period_amount"] == 0
    assert annual_row["baseline_amount"] is None
