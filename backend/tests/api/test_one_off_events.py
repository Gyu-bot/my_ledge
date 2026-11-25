from datetime import date, time

import pytest

from app.models.nature_axes import RecurringCommitment, TransactionNatureOverride
from app.models.settlement_group import SettlementMatch
from app.models.transaction import Transaction

EVENTS = "/api/v1/one-off-events"
TRANSACTIONS = "/api/v1/transactions"


def expense(day, amount, category, **extra):
    values = {
        "date": date.fromisoformat(day),
        "time": time(12),
        "type": "지출",
        "amount": amount,
        "description": f"synthetic {category}",
        "merchant": f"synthetic {category}",
        "category_major": category,
        **extra,
    }
    return Transaction(**values)


async def post_event(client, headers, name, *members):
    response = await client.post(
        EVENTS, json={"name": name, "transaction_ids": members}, headers=headers
    )
    assert response.status_code == 201, response.json()
    return response.json()["id"]


async def test_refund_attribution_and_direct_membership(
    async_client, api_headers, db_session
):
    purchase = expense("2030-01-10", -200, "구매")
    refund = expense("2030-02-03", 100, "환불")
    db_session.add_all([purchase, refund])
    await db_session.commit()
    purchase_id, refund_id = purchase.id, refund.id
    match = SettlementMatch(
        original_transaction_id=purchase_id,
        settlement_transaction_id=refund_id,
        status="user_confirmed",
        matched_amount=60,
    )
    db_session.add(match)
    await db_session.commit()
    a = await post_event(async_client, api_headers, "  구매 묶음 ", purchase_id)
    b = await post_event(async_client, api_headers, "환불 묶음", refund_id)

    a_detail = (await async_client.get(f"{EVENTS}/{a}")).json()
    assert [(item["period"], item["amount"]) for item in a_detail["periods"]] == [
        ("2030-01", 200),
        ("2030-02", -60),
    ]
    assert a_detail["counted_total"] == 140
    assert a_detail["members"][0]["transaction_id"] == purchase_id
    assert a_detail["name"] == "구매 묶음"
    b_detail = (await async_client.get(f"{EVENTS}/{b}")).json()
    assert b_detail["counted_total"] == -40
    assert b_detail["members"][0]["member_status"] == "counted"

    response = await async_client.get(
        TRANSACTIONS,
        params={
            "one_off_event_id": a,
            "category_major": "구매",
            "start_date": "2030-02-01",
        },
    )
    (row,) = response.json()["items"]
    assert row["id"] == refund_id
    assert row["one_off_event_id"] == b
    assert row["one_off_event_name"] == "환불 묶음"
    response = await async_client.get(
        TRANSACTIONS, params={"one_off_event_id": a, "category_major": "환불"}
    )
    assert response.json()["total"] == 0
    response = await async_client.get(TRANSACTIONS, params={"one_off": False})
    assert response.json()["total"] == 0

    match.matched_amount = 100
    await db_session.commit()
    b_detail = (await async_client.get(f"{EVENTS}/{b}")).json()
    assert b_detail["counted_total"] == 0
    assert b_detail["members"][0]["member_status"] == "fully_allocated"
    assert b_detail["periods"] == []

    response = await async_client.request(
        "DELETE",
        f"{EVENTS}/{a}/members",
        headers=api_headers,
        json={"transaction_ids": [refund_id]},
    )
    assert response.status_code == 200
    assert (await async_client.get(f"{TRANSACTIONS}/{refund_id}")).json()[
        "one_off_event_id"
    ] == b
    assert (
        await async_client.delete(f"{EVENTS}/{b}", headers=api_headers)
    ).status_code == 204
    assert (await async_client.get(f"{TRANSACTIONS}/{refund_id}")).json()[
        "one_off_event_id"
    ] is None


async def test_member_validation_and_dynamic_status(
    async_client, api_headers, db_session
):
    tx = expense("2030-01-10", -200, "구매")
    committed = expense("2030-01-11", -200, "약정")
    usd = expense("2030-01-12", -10, "외화", currency="USD")
    income = expense("2030-01-13", 10, "수입", type="수입")
    deleted = expense("2030-01-14", -10, "삭제", is_deleted=True)
    db_session.add_all([tx, committed, usd, income, deleted])
    db_session.add(
        RecurringCommitment(
            match_scope="category", category_major="약정", origin="user"
        )
    )
    await db_session.commit()
    ids = [row.id for row in (tx, committed, usd, income, deleted)]
    response = await async_client.post(
        EVENTS, json={"name": "합성", "transaction_ids": ids}
    )
    assert response.status_code in (401, 403)
    response = await async_client.post(
        EVENTS,
        headers=api_headers,
        json={"name": "합성", "transaction_ids": [*ids, 9999]},
    )
    assert response.status_code == 422
    assert [item["reason"] for item in response.json()["detail"]] == [
        "committed",
        "non_krw",
        "not_expense",
        "inactive",
        "not_found",
    ]
    assert (await async_client.get(EVENTS)).json() == []
    a = await post_event(async_client, api_headers, "합성 A", ids[0])
    b = await post_event(async_client, api_headers, "합성 B")
    response = await async_client.post(
        f"{EVENTS}/{b}/members", json={"transaction_ids": ids[:1]}, headers=api_headers
    )
    assert response.status_code == 409
    assert response.json()["detail"] == [
        {"transaction_id": ids[0], "reason": "in_other_event"}
    ]
    response = await async_client.post(
        f"{EVENTS}/{a}/members",
        json={"transaction_ids": ids[:1] * 2},
        headers=api_headers,
    )
    assert response.json()["direct_member_count"] == 1

    tx.category_major_user = "약정"
    await db_session.commit()
    current = (await async_client.get(f"{EVENTS}/{a}")).json()
    assert current["members"][0]["member_status"] == "committed_now"
    assert current["counted_total"] == 0
    db_session.add(
        TransactionNatureOverride(
            transaction_id=ids[0], excluded_from_commitments=True, source="user"
        )
    )
    await db_session.commit()
    current = (await async_client.get(f"{EVENTS}/{a}")).json()
    assert current["members"][0]["member_status"] == "counted"
    assert current["counted_total"] == 200
    tx.is_deleted = True
    await db_session.commit()
    current = (await async_client.get(f"{EVENTS}/{a}")).json()
    assert current["members"][0]["member_status"] == "inactive"
    assert current["members"][0]["inactive_reason"] == "deleted"
    assert current["counted_total"] == 0
    tx.is_deleted = False
    await db_session.commit()
    response = await async_client.patch(
        f"{EVENTS}/{a}", headers=api_headers, json={"name": "수정", "note": "합성"}
    )
    assert response.json()["note"] == "합성"
    assert response.json()["counted_total"] == 200


@pytest.mark.parametrize("name", [" ", "가" * 101, None])
async def test_event_name_validation(async_client, api_headers, name):
    response = await async_client.post(EVENTS, headers=api_headers, json={"name": name})
    assert response.status_code == 422
