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
        "category_minor": None,
        "source": "observed_pattern",
        "commitment_id": None,
        "commitment_label": None,
        "observed_periods": ["2030-03"],
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
    assert "대분류·소분류" in payload["basis"]["rules"]["annual_like"]
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


async def scenario_pairs_and_registered_yearly(session, client):
    from app.models.nature_axes import RecurringCommitment, TransactionNatureOverride

    def pair(month, amount, minor, *, merchant="synthetic-other"):
        row = tx(
            date(2030, month, 10), amount, category="synthetic-major", merchant=merchant
        )
        row.category_minor = minor
        return row

    await add(
        session,
        [
            tx(date(2030, month, 1), -10, category="synthetic-major")
            for month in range(1, 13)
        ],
    )
    annual = pair(3, -12001, "raw-minor")
    annual.category_minor_user = "synthetic-once"
    annual.category_major = "raw-major"
    annual.category_major_user = "synthetic-major"
    rows = [
        annual,
        pair(3, 1, "synthetic-once"),
        pair(2, -6000, "synthetic-twice"),
        pair(9, -6000, "synthetic-twice"),
        *[pair(month, -100, "synthetic-three") for month in (2, 3, 4)],
        pair(5, -1000, "synthetic-mixed", merchant="synthetic-yearly"),
        pair(5, 100, "synthetic-mixed", merchant="synthetic-yearly"),
        pair(5, -300, "synthetic-mixed"),
        pair(6, -2400, "synthetic-only", merchant="synthetic-only-yearly"),
        *[
            pair(
                month,
                -400,
                "synthetic-registered-three",
                merchant="synthetic-multi-yearly",
            )
            for month in (1, 2, 3)
        ],
        *[pair(month, -20, "synthetic-registered-three") for month in (1, 2, 3)],
        tx(date(2030, 7, 10), -120, category="synthetic-null"),
        tx(date(2030, 12, 31), 1, tx_type="수입"),
    ]
    empty_minor = tx(date(2030, 8, 10), -120, category="synthetic-null")
    empty_minor.category_minor = ""
    rows.append(empty_minor)
    deleted = pair(4, -900, "synthetic-once")
    deleted.is_deleted = True
    foreign = pair(4, -900, "synthetic-once")
    foreign.currency = "USD"
    transfer = pair(4, -900, "synthetic-once")
    transfer.type = "이체"
    rows.extend([deleted, foreign, transfer])
    await add(session, rows)
    commitments = []
    for merchant, minor in [
        ("synthetic-yearly", "synthetic-mixed"),
        ("synthetic-only-yearly", "synthetic-only"),
        ("synthetic-multi-yearly", "synthetic-registered-three"),
    ]:
        item = RecurringCommitment(
            label="synthetic-label",
            match_scope="merchant",
            merchant=merchant,
            category_major="synthetic-major",
            category_minor=minor,
            cycle="yearly",
            origin="migration" if minor == "synthetic-only" else "user",
        )
        session.add(item)
        commitments.append(item)
    await session.commit()
    excluded = pair(5, -200, "synthetic-mixed", merchant="synthetic-yearly")
    await add(session, [excluded])
    session.add(
        TransactionNatureOverride(
            transaction_id=excluded.id, excluded_from_commitments=True, source="user"
        )
    )
    await session.commit()

    params = {"period": "2030-12", "lists": "twelve_month"}
    path = "/api/v1/read/comparison/contributions"
    contributions_before = await client.get(path, params=params, headers=HEADERS)
    before = await get(
        client, "/metrics/monthly-flow", start_period="2030-12", end_period="2030-12"
    )
    payload = await reference(client)
    items = payload["data"]["annual_items"]
    assert payload["data"]["annual_missing_reason"] is None
    observed = {
        (item["category"], item["category_minor"]): item
        for item in items
        if item["source"] == "observed_pattern"
    }
    assert set(observed) == {
        ("synthetic-major", "synthetic-once"),
        ("synthetic-major", "synthetic-twice"),
        ("synthetic-major", "synthetic-mixed"),
        ("synthetic-null", None),
    }
    assert observed[("synthetic-major", "synthetic-once")]["window_amount"] == 12000
    assert observed[("synthetic-major", "synthetic-once")]["monthly_equivalent"] == 1000
    assert observed[("synthetic-major", "synthetic-twice")]["observed_periods"] == [
        "2030-02",
        "2030-09",
    ]
    assert observed[("synthetic-null", None)]["observed_periods"] == [
        "2030-07",
        "2030-08",
    ]
    assert observed[("synthetic-null", None)]["window_amount"] == 240
    assert observed[("synthetic-major", "synthetic-mixed")]["window_amount"] == 500
    registered = {
        item["commitment_id"]: item
        for item in items
        if item["source"] == "registered_yearly_commitment"
    }
    assert set(registered) == {item.id for item in commitments}
    assert registered[commitments[0].id]["window_amount"] == 900
    assert registered[commitments[0].id]["monthly_equivalent"] == 75
    assert registered[commitments[0].id]["observed_periods"] == ["2030-05"]
    assert registered[commitments[1].id]["window_amount"] == 2400
    assert registered[commitments[2].id]["active_months_in_window"] == 3
    assert registered[commitments[2].id]["window_amount"] == 1200
    assert all(
        item["active_months_in_window"] == len(item["observed_periods"])
        for item in items
    )
    assert [item["window_amount"] for item in items] == [
        12000,
        12000,
        2400,
        1200,
        900,
        500,
        240,
    ]
    assert items[0]["category_minor"] == "synthetic-once"
    assert payload["data"]["total_outflow"] == before["items"][0]["total_outflow"]
    assert (
        await get(
            client,
            "/metrics/monthly-flow",
            start_period="2030-12",
            end_period="2030-12",
        )
        == before
    )
    contributions_after = await client.get(path, params=params, headers=HEADERS)
    assert contributions_after.content == contributions_before.content
    assert "synthetic-major" not in {
        item["category"]
        for item in contributions_after.json()["data"]["twelve_month_items"]
    }
    assert (await reference(client))["data"] == payload["data"]


async def scenario_refund_nets_and_commitment_attribution(session, client):
    from app.models.nature_axes import RecurringCommitment
    from app.models.settlement_group import SettlementMatch

    await seed(session)
    purchase = tx(
        date(2030, 2, 10),
        -1200,
        category="synthetic-allocated",
        merchant="synthetic-registered",
    )
    purchase.category_minor = "synthetic-minor"
    refund = tx(
        date(2030, 3, 10),
        1200,
        category="synthetic-refund",
        merchant="synthetic-different",
    )
    await add(session, [purchase, refund])
    commitment = RecurringCommitment(
        match_scope="merchant",
        merchant="synthetic-registered",
        category_major="synthetic-allocated",
        category_minor="synthetic-minor",
        cycle="yearly",
        origin="user",
    )
    session.add(commitment)
    session.add(
        SettlementMatch(
            original_transaction_id=purchase.id,
            settlement_transaction_id=refund.id,
            matched_amount=1200,
            status="user_confirmed",
        )
    )
    await session.commit()
    # The refund follows the original purchase's pair and commitment in the
    # flow view, despite a different raw category and merchant on the refund.
    items = (await reference(client))["data"]["annual_items"]
    item = next(item for item in items if item["commitment_id"] == commitment.id)
    assert item["window_amount"] == item["monthly_equivalent"] == 0
    assert item["observed_periods"] == ["2030-02"]
    assert not any(
        item["category"] == "synthetic-allocated"
        and item["source"] == "observed_pattern"
        for item in items
    )
    assert not any(item["category"] == "synthetic-refund" for item in items)
    # Negative annual net is retained, rather than silently discarding refunds.
    await add(
        session,
        [
            tx(
                date(2030, 4, 10),
                120,
                category="synthetic-allocated",
                merchant="synthetic-registered",
            )
        ],
    )
    extra = tx(
        date(2030, 4, 10),
        120,
        category="synthetic-allocated",
        merchant="synthetic-registered",
    )
    extra.category_minor = "synthetic-minor"
    await add(session, [extra])
    items = (await reference(client))["data"]["annual_items"]
    item = next(item for item in items if item["commitment_id"] == commitment.id)
    assert item["window_amount"] == -120
    assert item["monthly_equivalent"] == -10
    assert item["observed_periods"] == ["2030-02"]
