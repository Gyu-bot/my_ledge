"""HTTP contract of the T056 two-axis nature API (synthetic data only)."""

from datetime import date, time

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.transaction import Transaction

BASE = "/api/v1/nature"


def tx(merchant: str, *, tx_type: str = "지출", major: str = "cat-a") -> Transaction:
    return Transaction(
        date=date(2026, 2, 10),
        time=time(12, 0),
        type=tx_type,
        category_major=major,
        category_minor=None,
        description=merchant,
        merchant=merchant,
        amount=-10_000 if tx_type != "수입" else 10_000,
        currency="KRW",
    )


async def test_every_route_requires_api_key(async_client: AsyncClient) -> None:
    calls = [
        ("GET", "/category-defaults", None),
        (
            "PUT",
            "/category-defaults",
            {"category_major": "x", "adjustability": "protected"},
        ),
        ("DELETE", "/category-defaults/1", None),
        ("GET", "/recurring-commitments", None),
        (
            "POST",
            "/recurring-commitments",
            {"match_scope": "category", "category_major": "x"},
        ),
        ("PATCH", "/recurring-commitments/1", {}),
        ("POST", "/recurring-commitments/1/end", {"end_date": "2026-01-01"}),
        ("DELETE", "/recurring-commitments/1", None),
        ("GET", "/transactions/1", None),
        ("PUT", "/transactions/1/adjustability", {"adjustability": "protected"}),
        ("DELETE", "/transactions/1/adjustability", None),
    ]
    for method, path, body in calls:
        response = await async_client.request(method, BASE + path, json=body)
        assert response.status_code == 401, (method, path)


async def test_category_defaults_set_list_replace_delete(
    async_client: AsyncClient, api_headers: dict[str, str], db_session: AsyncSession
) -> None:
    row = tx("m-1", major="cat-d")
    db_session.add(row)
    await db_session.commit()

    put = await async_client.put(
        BASE + "/category-defaults",
        json={"category_major": "cat-d", "adjustability": "adjustable"},
        headers=api_headers,
    )
    assert put.status_code == 200
    again = await async_client.put(
        BASE + "/category-defaults",
        json={"category_major": "cat-d", "adjustability": "protected"},
        headers=api_headers,
    )
    assert again.json()["id"] == put.json()["id"]  # one default per category
    listed = await async_client.get(BASE + "/category-defaults", headers=api_headers)
    assert [item["adjustability"] for item in listed.json()["items"]] == ["protected"]

    explained = await async_client.get(
        f"{BASE}/transactions/{row.id}", headers=api_headers
    )
    body = explained.json()
    assert (body["adjustability"], body["adjustability_source"]) == (
        "protected",
        "category_default",
    )
    assert body["levels"]["category_default"] == "protected"

    bad = await async_client.put(
        BASE + "/category-defaults",
        json={"category_major": "cat-d", "adjustability": "undecided"},
        headers=api_headers,
    )
    assert bad.status_code == 422
    deleted = await async_client.delete(
        f"{BASE}/category-defaults/{put.json()['id']}", headers=api_headers
    )
    assert deleted.status_code == 204
    assert (
        await async_client.delete(
            f"{BASE}/category-defaults/{put.json()['id']}", headers=api_headers
        )
    ).status_code == 404


async def test_recurring_commitment_lifecycle(
    async_client: AsyncClient, api_headers: dict[str, str], db_session: AsyncSession
) -> None:
    row = tx("m-sub")
    db_session.add(row)
    await db_session.commit()

    invalid = [
        {"match_scope": "merchant", "category_major": "cat-a"},
        {"match_scope": "category", "category_major": "cat-a", "merchant": "m"},
        {"match_scope": "category", "category_major": "cat-a", "cycle": "n_times"},
        {
            "match_scope": "category",
            "category_major": "cat-a",
            "start_date": "2026-02-01",
            "end_date": "2026-01-01",
        },
    ]
    for body in invalid:
        response = await async_client.post(
            BASE + "/recurring-commitments", json=body, headers=api_headers
        )
        assert response.status_code == 422, body

    created = await async_client.post(
        BASE + "/recurring-commitments",
        json={
            "match_scope": "merchant",
            "merchant": "m-sub",
            "category_major": "cat-a",
            "cycle": "monthly",
            "amount_kind": "variable",
            "adjustability": "adjustable",
            "start_date": "2026-01-01",
        },
        headers=api_headers,
    )
    assert created.status_code == 201
    commitment = created.json()
    assert commitment["origin"] == "user"
    assert commitment["member_transaction_count"] == 1
    assert commitment["last_member_date"] == "2026-02-10"

    patched = await async_client.patch(
        f"{BASE}/recurring-commitments/{commitment['id']}",
        json={"adjustability": "protected", "cycle": "n_times", "total_count": 12},
        headers=api_headers,
    )
    assert patched.status_code == 200
    assert (patched.json()["adjustability"], patched.json()["total_count"]) == (
        "protected",
        12,
    )
    explained = (
        await async_client.get(f"{BASE}/transactions/{row.id}", headers=api_headers)
    ).json()
    assert explained["payment_form"] == "committed"
    assert explained["commitment"]["id"] == commitment["id"]
    assert explained["commitment"]["match"] == "rule"
    assert explained["adjustability_source"] == "commitment"

    ended = await async_client.post(
        f"{BASE}/recurring-commitments/{commitment['id']}/end",
        json={"end_date": "2026-01-31"},
        headers=api_headers,
    )
    assert ended.status_code == 200
    assert ended.json()["member_transaction_count"] == 0
    explained = (
        await async_client.get(f"{BASE}/transactions/{row.id}", headers=api_headers)
    ).json()
    assert explained["payment_form"] == "ad_hoc"
    assert explained["adjustability"] == "undecided"

    too_early = await async_client.post(
        f"{BASE}/recurring-commitments/{commitment['id']}/end",
        json={"end_date": "2025-12-31"},
        headers=api_headers,
    )
    assert too_early.status_code == 422
    assert (
        await async_client.delete(
            f"{BASE}/recurring-commitments/{commitment['id']}", headers=api_headers
        )
    ).status_code == 204
    listed = await async_client.get(
        BASE + "/recurring-commitments", headers=api_headers
    )
    assert listed.json()["items"] == []


async def test_transaction_adjustability_set_and_clear(
    async_client: AsyncClient, api_headers: dict[str, str], db_session: AsyncSession
) -> None:
    spend = tx("m-1")
    income = tx("payer", tx_type="수입")
    db_session.add_all([spend, income])
    await db_session.commit()

    put = await async_client.put(
        f"{BASE}/transactions/{spend.id}/adjustability",
        json={"adjustability": "adjustable"},
        headers=api_headers,
    )
    assert put.status_code == 200
    body = put.json()
    assert (body["adjustability"], body["adjustability_source"]) == (
        "adjustable",
        "transaction",
    )
    assert body["override_source"] == "user"
    assert body["legacy"]["spend_necessity"] is None  # old columns untouched

    cleared = await async_client.delete(
        f"{BASE}/transactions/{spend.id}/adjustability", headers=api_headers
    )
    assert cleared.json()["adjustability"] == "undecided"
    assert cleared.json()["override_source"] is None

    refused = await async_client.put(
        f"{BASE}/transactions/{income.id}/adjustability",
        json={"adjustability": "protected"},
        headers=api_headers,
    )
    assert refused.status_code == 422
    income_body = (
        await async_client.get(f"{BASE}/transactions/{income.id}", headers=api_headers)
    ).json()
    assert income_body["adjustability"] == "not_applicable"
    assert income_body["payment_form"] == "not_applicable"
    missing = await async_client.get(f"{BASE}/transactions/999999", headers=api_headers)
    assert missing.status_code == 404
