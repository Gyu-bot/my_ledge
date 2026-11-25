"""T067 metric and review scenarios on SQLite and migrated PostgreSQL."""

from datetime import date

import pytest

from comparison_scenarios import HEADERS, add, get, tx
from spending_limit_scenarios import comparison, post, reference
from test_metric_views_postgresql import migrated_url, pg_client, pg_session  # noqa: F401

CONTRIBUTIONS = "/read/comparison/contributions"
COMPARISON = "/read/comparison/monthly-flow"
MODES = ["sqlite", "postgresql"]


@pytest.fixture(params=MODES)
def ledger(request):
    if request.param == "sqlite":
        return request.getfixturevalue("db_session"), request.getfixturevalue(
            "async_client"
        )
    return request.getfixturevalue("pg_session"), request.getfixturevalue("pg_client")


async def mark(client, *rows):
    response = await client.post(
        "/api/v1/one-off-events",
        headers=HEADERS,
        json={"name": "합성 일회성", "transaction_ids": [row.id for row in rows]},
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


def measures(payload):
    return {item["key"]: item for item in payload["data"]["measures"]}


async def test_ongoing_medians_same_day_zero_missing_and_additivity(ledger):
    session, client = ledger
    january = tx(date(2030, 1, 2), -290)
    late = tx(date(2030, 1, 20), -500)
    may = tx(date(2030, 5, 3), -111)
    june = tx(date(2030, 6, 2), -50)
    await add(
        session,
        [
            tx(date(2030, 1, 1), -10),
            january,
            late,
            tx(date(2030, 3, 3), -100),
            tx(date(2030, 4, 3), -200),
            may,
            june,
            tx(date(2030, 6, 3), -70),
            tx(date(2030, 6, 10), -60, category="other"),
        ],
    )

    legacy = measures(await get(client, COMPARISON, period="2030-06"))
    assert list(legacy)[-3:] == [
        "one_off_total",
        "ongoing_outflow",
        "ongoing_living_spend",
    ]
    assert (
        legacy["ongoing_outflow"]["baseline_amount"]
        == legacy["total_outflow"]["baseline_amount"]
    )
    zero = (
        await get(
            client, CONTRIBUTIONS, period="2030-06", baseline="previous_month", limit=1
        )
    )["data"]
    with_all = (
        await get(
            client,
            CONTRIBUTIONS,
            period="2030-06",
            baseline="previous_month",
            limit=1,
            one_off="include",
        )
    )["data"]
    assert {key: value for key, value in zero.items() if key != "one_off"} == {
        key: value for key, value in with_all.items() if key != "one_off"
    }
    assert zero["one_off"]["target_total"] == 0

    event_id = await mark(client, january, may, june, late)
    current = measures(await get(client, COMPARISON, period="2030-06"))
    assert {key: current[key] for key in list(legacy)[:-3]} == {
        key: legacy[key] for key in list(legacy)[:-3]
    }
    assert current["ongoing_outflow"]["target_amount"] == 130
    assert current["ongoing_outflow"]["baseline_amount"] == 55
    assert current["ongoing_outflow"]["baseline_amount"] != (
        current["total_outflow"]["baseline_amount"]
        - current["one_off_total"]["baseline_amount"]
    )
    assert (
        measures(await get(client, COMPARISON, period="2030-02"))["ongoing_outflow"][
            "target_amount"
        ]
        is None
    )
    assert (
        measures(await get(client, COMPARISON, period="2030-05"))["ongoing_outflow"][
            "target_amount"
        ]
        == 0
    )
    data = (
        await get(
            client, CONTRIBUTIONS, period="2030-06", baseline="previous_month", limit=1
        )
    )["data"]
    assert (
        data["target_total"] == data["change_total"] == data["sum_item_changes"] == 130
    )
    assert data["baseline_total"] == data["non_additive_gap"] == 0
    assert data["items_summary"]["truncated"]
    assert data["items_summary"]["returned_change_amount_sum"] == 70
    assert data["items_summary"]["not_returned_change_amount_sum"] == 60
    assert data["one_off"] == {
        "mode": "exclude",
        "target_total": 50,
        "target_events": [{"event_id": event_id, "name": "합성 일회성", "amount": 50}],
        "baseline_values": [{"period": "2030-05", "amount": 111}],
    }
    inclusive = (
        await get(
            client,
            CONTRIBUTIONS,
            period="2030-06",
            baseline="previous_month",
            one_off="include",
        )
    )["data"]
    assert inclusive["change_total"] == inclusive["sum_item_changes"] == 69
    reference = (
        await get(
            client,
            CONTRIBUTIONS,
            period="2030-06",
            category="category-a",
            adjustability="all",
        )
    )["data"]["one_off"]
    assert {"period": "2030-01", "amount": 290} in reference["baseline_values"]
    assert reference["target_total"] == 50
    other = (
        await get(
            client,
            CONTRIBUTIONS,
            period="2030-06",
            category="other",
            adjustability="protected",
        )
    )["data"]["one_off"]
    assert other["target_total"] == 0 and other["target_events"] == []

    body = await get(client, "/read/one-off-events")
    assert body["data"]["items"][0]["id"] == event_id
    flow = await get(
        client, "/read/monthly-flow", start_period="2030-05", end_period="2030-05"
    )
    (month,) = flow["data"]["items"]
    assert month["one_off_total"] == month["total_outflow"] == 111
    assert month["ongoing_outflow"] == month["ongoing_living_spend"] == 0
    assert month["residual"] == -111


async def test_annual_pattern_and_limit_actuals(ledger):
    session, client = ledger
    ordinary = [tx(date(2030, 1, 1), 100, tx_type="수입")]
    await add(session, ordinary)
    await post(client, value="category-a", effective="2030-12", amount=80)
    for month in range(2, 13):
        ordinary.append(tx(date(2030, month, 1), 100, tx_type="수입"))
    march = tx(date(2030, 3, 4), -32)
    june = tx(date(2030, 6, 4), -48)
    december = tx(date(2030, 12, 4), -100)
    await add(
        session,
        [
            *ordinary[1:],
            march,
            june,
            december,
            tx(date(2030, 12, 31), 100, tx_type="수입"),
        ],
    )
    await mark(client, december)
    body = await reference(client)
    (item,) = body["data"]["annual_items"]
    assert item["category"] == "category-a"
    assert item["active_months_in_window"] == 2
    assert item["window_amount"] == 80
    limit = comparison(body, "category", "category-a")
    assert limit["one_off_amount"] == limit["actual_amount"] == 100
    assert limit["difference_amount"] == 20
    contribution = (await get(client, CONTRIBUTIONS, period="2030-12"))["data"]
    (item,) = contribution["twelve_month_items"]
    assert item["target_amount"] == 80
    assert item["active_months_in_window"] == 2


async def test_review_excludes_candidate_and_both_sql_baselines(ledger):
    session, client = ledger

    def expense(day, amount):
        return tx(date.fromisoformat(day), amount, spend_necessity="discretionary")

    prior = expense("2030-01-02", -900_000)
    current = expense("2030-02-03", -800_000)
    ongoing = expense("2030-02-02", -300_000)
    await add(
        session,
        [
            expense("2030-01-01", -100_000),
            prior,
            ongoing,
            current,
            tx(date(2030, 2, 28), 100, tx_type="수입"),
        ],
    )
    await mark(client, prior, current)
    body = await get(client, "/read/review-items", period="2030-02")
    (candidate,) = [
        row for row in body["data"]["items"] if row["subject"] == "transaction"
    ]
    assert candidate["transaction_id"] == ongoing.id
    reasons = {reason["code"]: reason for reason in candidate["listed_because"]}
    for reason in ("merchant_spike", "discretionary_spike"):
        assert reasons[reason]["signals"][f"{reason}_current_total"] == 300_000
        assert reasons[reason]["signals"][f"{reason}_baseline_avg"] == 100_000
    (anomaly,) = [
        row for row in body["data"]["items"] if row["subject"] == "category_month"
    ]
    assert anomaly["amount"] == 300_000
    assert anomaly["baseline_amount"] == 100_000
