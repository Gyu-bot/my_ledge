"""T062 synthetic scenarios shared by SQLite and migrated PostgreSQL."""

from datetime import date
from comparison_scenarios import HEADERS, add, get, tx

READ = "/read/spending-reference"
LIMITS = "/api/v1/spending-limits"


async def seed(session, *, missing_month=None, start_day=1):
    rows = [
        tx(
            date(2030, month, start_day if month == 1 else 1),
            -120,
            category="category-monthly",
            spend_necessity="discretionary",
        )
        for month in range(1, 13)
        if month != missing_month
    ]
    rows += [
        tx(date(2030, 3, 10), -12001, category="category-annual"),
        tx(date(2030, 3, 11), 1, category="category-annual"),
        tx(date(2030, 3, 12), -6000, category="category-twice"),
        tx(date(2030, 9, 12), -6000, category="category-twice"),
        *[
            tx(date(2030, month, 15), -100, category="category-three")
            for month in (2, 3, 4)
        ],
        tx(date(2030, 12, 31), 1000, tx_type="수입"),
    ]
    await add(session, rows)


async def reference(client, period="2030-12"):
    return await get(client, READ, period=period)


async def post(
    client,
    *,
    kind="category",
    value="category-annual",
    effective="2031-01",
    amount=1000,
):
    response = await client.post(
        LIMITS,
        headers=HEADERS,
        json={
            "target_kind": kind,
            "target_value": value,
            "effective_from_period": effective,
            "amount": amount,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def comparison(payload, kind, value):
    return next(
        item
        for item in payload["data"]["comparisons"]
        if item["target_kind"] == kind and item["target_value"] == value
    )


async def scenario_annual_reference_and_outflow(session, client):
    await seed(session)
    before = await get(
        client, "/metrics/monthly-flow", start_period="2030-12", end_period="2030-12"
    )
    payload = await reference(client)
    annual = {item["category"]: item for item in payload["data"]["annual_items"]}
    assert set(annual) == {"category-annual", "category-twice"}
    assert annual["category-annual"] == {
        "category": "category-annual",
        "window_amount": 12000,
        "monthly_equivalent": 1000,
        "active_months_in_window": 1,
    }
    assert annual["category-twice"]["active_months_in_window"] == 2
    contributions = await get(
        client, "/read/comparison/contributions", period="2030-12", lists="twelve_month"
    )
    assert {
        item["category"]: item["target_amount"]
        for item in contributions["data"]["twelve_month_items"]
    } == {key: value["window_amount"] for key, value in annual.items()}
    assert (
        payload["data"]["total_outflow"] == 120 == before["items"][0]["total_outflow"]
    )
    await post(client)
    after = await get(
        client, "/metrics/monthly-flow", start_period="2030-12", end_period="2030-12"
    )
    assert after == before
    assert (await reference(client))["data"] == payload["data"]
    no_limit = comparison(payload, "category", "category-monthly")
    assert (
        no_limit["actual_amount"],
        no_limit["limit_amount"],
        no_limit["difference_amount"],
        no_limit["missing_reason"],
    ) == (120, None, None, "no_limit_set")
    assert payload["basis"]["definition"] == "spending_reference.v1"
    assert "T057" in payload["basis"]["rules"]["annual_like"]
    assert payload["period_scope"]["start_period"] == "2030-12"


async def scenario_limit_history(session, client):
    await seed(session)
    first = await post(client, value="category-monthly", amount=100)
    axis = await post(client, kind="adjustability", value="adjustable", amount=0)
    second = await post(
        client, value="category-monthly", effective="2031-02", amount=200
    )
    cleared = await post(
        client, value="category-monthly", effective="2031-03", amount=None
    )
    await add(
        session,
        [
            tx(
                date(2031, month, 1),
                -120,
                category="category-monthly",
                spend_necessity="discretionary",
            )
            for month in (1, 2, 3)
        ]
        + [tx(date(2031, 3, 31), 1000, tx_type="수입")],
    )
    jan = comparison(await reference(client, "2031-01"), "category", "category-monthly")
    feb = comparison(await reference(client, "2031-02"), "category", "category-monthly")
    mar = comparison(await reference(client, "2031-03"), "category", "category-monthly")
    assert (
        jan["limit_revision_id"],
        jan["limit_amount"],
        jan["difference_amount"],
    ) == (first["id"], 100, 20)
    assert (
        feb["limit_revision_id"],
        feb["limit_amount"],
        feb["difference_amount"],
    ) == (second["id"], 200, -80)
    assert (mar["limit_revision_id"], mar["limit_amount"], mar["missing_reason"]) == (
        cleared["id"],
        None,
        "no_limit_set",
    )
    adjusted = comparison(
        await reference(client, "2031-01"), "adjustability", "adjustable"
    )
    assert (
        adjusted["limit_revision_id"],
        adjusted["limit_amount"],
        adjusted["difference_amount"],
    ) == (axis["id"], 0, 120)
    response = await client.post(
        LIMITS,
        headers=HEADERS,
        json={
            "target_kind": "category",
            "target_value": "category-monthly",
            "effective_from_period": "2031-01",
            "amount": 999,
        },
    )
    assert response.status_code == 422
    assert (
        comparison(await reference(client, "2031-01"), "category", "category-monthly")
        == jan
    )
    history = (await client.get(LIMITS, headers=HEADERS)).json()
    assert len(history["revisions"]) == 4
    assert history["last_closed_period"] == "2031-03"
    for method in (client.patch, client.delete):
        assert (
            await method(f"{LIMITS}/{first['id']}", headers=HEADERS)
        ).status_code in (404, 405)


async def scenario_no_limit_progress_and_gaps(session, client):
    empty = await reference(client)
    assert empty["status"] == "not_imported"
    assert empty["data"]["total_outflow"] is None
    await add(session, [tx(date(2030, 1, 15), -1, category="initial-synthetic")])
    only_partial = await get(client, READ)
    assert only_partial["data"]["period"] == "2030-01"
    assert (
        only_partial["data"]["comparisons"][0]["missing_reason"] == "month_in_progress"
    )
    await seed(session, missing_month=6, start_day=15)
    initial = await reference(client)
    assert initial["data"]["annual_items"] == []
    assert initial["data"]["annual_missing_reason"] == "incomplete_twelve_month_window"
    assert (
        comparison(await reference(client, "2030-06"), "adjustability", "adjustable")[
            "missing_reason"
        ]
        == "no_transactions"
    )
    assert (
        comparison(await reference(client, "2029-12"), "adjustability", "adjustable")[
            "missing_reason"
        ]
        == "not_imported"
    )
    assert (
        comparison(await reference(client, "2030-01"), "category", "category-monthly")[
            "missing_reason"
        ]
        == "partial_month"
    )
    await post(client, value="category-monthly", amount=100)
    await add(session, [tx(date(2031, 1, 15), -500, category="category-monthly")])
    partial = await reference(client, "2031-01")
    row = comparison(partial, "category", "category-monthly")
    assert (
        row["actual_amount"],
        row["limit_amount"],
        row["difference_amount"],
        row["missing_reason"],
    ) == (500, 100, None, "month_in_progress")
    assert partial["data"]["annual_missing_reason"] == "month_in_progress"
    assert partial["data"]["annual_items"] == []
    assert (await get(client, READ))["data"]["period"] == "2030-12"
