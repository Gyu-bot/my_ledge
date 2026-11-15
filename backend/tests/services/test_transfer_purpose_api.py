"""T061 human-set transfer purpose API (SQLite views)."""

from datetime import date

from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.transaction import Transaction
from app.models.transfer_purpose import TransferPurposeOverride
from app.services.metric_views import FLOW_LINES_VIEW, TRANSFER_PURPOSE_VIEW
from app.services.transfer_purpose_service import move_transfer_purpose_override
from net_worth_scenarios import tx

BASE = "/api/v1/transfer-purposes"


async def _add(db_session: AsyncSession, *rows: Transaction) -> list[int]:
    db_session.add_all(rows)
    await db_session.commit()
    return [row.id for row in rows]


async def test_unmarked_transfers_are_undecided_and_nothing_is_inferred(
    async_client: AsyncClient, api_headers: dict[str, str], db_session: AsyncSession
) -> None:
    # Names that might look like an investment or savings account are not
    # read: without a human mark every transfer is undecided.
    ids = await _add(
        db_session,
        tx(date(2026, 2, 1), -500_000, tx_type="이체", merchant="invest-broker"),
        tx(date(2026, 2, 2), -100_000, tx_type="이체", merchant="savings-deposit"),
        tx(date(2026, 2, 3), -50_000, merchant="shop"),
    )
    response = await async_client.get(f"{BASE}/transactions", headers=api_headers)
    payload = response.json()
    assert payload["total_count"] == 2
    assert payload["undecided_count"] == 2
    assert payload["undecided_activity_total"] == 600_000
    assert [item["transaction_id"] for item in payload["items"]] == ids[:2]
    assert {item["purpose_source"] for item in payload["items"]} == {"none"}

    spend = await async_client.put(
        f"{BASE}/transactions/{ids[2]}",
        json={"purpose": "savings"},
        headers=api_headers,
    )
    assert spend.status_code == 422
    unknown = await async_client.put(
        f"{BASE}/transactions/{ids[0]}", json={"purpose": "other"}, headers=api_headers
    )
    assert unknown.status_code == 422
    missing = await async_client.get(f"{BASE}/transactions/999999", headers=api_headers)
    assert missing.status_code == 404


async def test_precedence_transaction_over_merchant_over_category(
    async_client: AsyncClient, api_headers: dict[str, str], db_session: AsyncSession
) -> None:
    t_id, m_id, c_id, minor_id = await _add(
        db_session,
        tx(date(2026, 2, 1), -1, tx_type="이체", merchant="cp-a", category="cat-t"),
        tx(date(2026, 2, 2), -2, tx_type="이체", merchant="cp-a", category="cat-t"),
        tx(date(2026, 2, 3), -3, tx_type="이체", merchant="cp-b", category="cat-t"),
        tx(date(2026, 2, 4), -4, tx_type="이체", merchant="cp-c", category="cat-u"),
    )
    minor_row = await db_session.get(Transaction, minor_id)
    assert minor_row is not None
    minor_row.category_minor = "sub-1"
    await db_session.commit()

    async def post(body: dict) -> dict:
        response = await async_client.post(
            f"{BASE}/rules", json=body, headers=api_headers
        )
        assert response.status_code == 201, response.text
        return response.json()

    category_rule = await post(
        {
            "match_scope": "category",
            "category_major": "cat-t",
            "purpose": "internal_move",
        }
    )
    merchant_rule = await post(
        {"match_scope": "merchant", "merchant": "cp-a", "purpose": "investment"}
    )
    whole_major = await post(
        {"match_scope": "category", "category_major": "cat-u", "purpose": "savings"}
    )
    exact_minor = await post(
        {
            "match_scope": "category",
            "category_major": "cat-u",
            "category_minor": "sub-1",
            "purpose": "internal_move",
        }
    )
    put = await async_client.put(
        f"{BASE}/transactions/{t_id}", json={"purpose": "savings"}, headers=api_headers
    )
    assert put.json()["purpose"] == "savings"

    rows = {
        row["transaction_id"]: (row["purpose"], row["purpose_source"], row["rule_id"])
        for row in (await db_session.execute(select(TRANSFER_PURPOSE_VIEW))).mappings()
    }
    assert rows[t_id][:2] == ("savings", "transaction")
    assert rows[m_id] == ("investment", "rule_merchant", merchant_rule["id"])
    assert rows[c_id] == ("internal_move", "rule_category", category_rule["id"])
    assert rows[minor_id] == ("internal_move", "rule_category", exact_minor["id"])

    listing = (await async_client.get(f"{BASE}/rules", headers=api_headers)).json()
    counts = {item["id"]: item["matched_transfer_count"] for item in listing["items"]}
    assert counts == {
        category_rule["id"]: 1,
        merchant_rule["id"]: 1,
        whole_major["id"]: 0,
        exact_minor["id"]: 1,
    }

    # Clearing the transaction-level purpose falls back to the merchant rule.
    cleared = await async_client.delete(
        f"{BASE}/transactions/{t_id}", headers=api_headers
    )
    assert cleared.json()["purpose_source"] == "rule_merchant"
    assert cleared.json()["transaction_purpose"] is None

    duplicate = await async_client.post(
        f"{BASE}/rules",
        json={"match_scope": "merchant", "merchant": "cp-a", "purpose": "savings"},
        headers=api_headers,
    )
    assert duplicate.status_code == 409
    invalid = await async_client.post(
        f"{BASE}/rules",
        json={"match_scope": "merchant", "category_major": "x", "purpose": "savings"},
        headers=api_headers,
    )
    assert invalid.status_code == 422

    patched = await async_client.patch(
        f"{BASE}/rules/{merchant_rule['id']}",
        json={"purpose": "savings", "label": "label-a"},
        headers=api_headers,
    )
    assert patched.status_code == 200
    assert patched.json()["purpose"] == "savings"
    rescope = await async_client.patch(
        f"{BASE}/rules/{merchant_rule['id']}",
        json={"match_scope": "category"},
        headers=api_headers,
    )
    assert rescope.status_code == 422  # category scope needs category_major
    removed = await async_client.delete(
        f"{BASE}/rules/{merchant_rule['id']}", headers=api_headers
    )
    assert removed.status_code == 204
    explained = await async_client.get(
        f"{BASE}/transactions/{m_id}", headers=api_headers
    )
    assert explained.json()["purpose_source"] == "rule_category"
    gone = await async_client.delete(
        f"{BASE}/rules/{merchant_rule['id']}", headers=api_headers
    )
    assert gone.status_code == 404


async def test_transfer_rows_split_the_transfer_row_exactly(
    async_client: AsyncClient, api_headers: dict[str, str], db_session: AsyncSession
) -> None:
    ids = await _add(
        db_session,
        tx(date(2026, 2, 1), 3_000_000, tx_type="수입"),
        tx(date(2026, 2, 2), -400_000),
        tx(date(2026, 2, 3), -1_000_000, tx_type="이체", merchant="cp-i"),
        tx(date(2026, 2, 4), -300_000, tx_type="이체", merchant="cp-s"),
        tx(date(2026, 2, 5), -700_000, tx_type="이체", merchant="own-b"),
        tx(date(2026, 2, 5), 700_000, tx_type="이체", merchant="own-a"),
        tx(date(2026, 2, 6), 90_000, tx_type="이체", merchant="cp-u"),
    )
    for transaction_id, purpose in zip(
        ids[2:6],
        ["investment", "savings", "internal_move", "internal_move"],
        strict=True,
    ):
        db_session.add(
            TransferPurposeOverride(transaction_id=transaction_id, purpose=purpose)
        )
    await db_session.commit()

    lines = (
        await db_session.execute(
            select(FLOW_LINES_VIEW.c.type, FLOW_LINES_VIEW.c.transfer_purpose)
        )
    ).all()
    for line_type, purpose in lines:
        assert (purpose is not None) == (line_type == "이체")

    payload = (
        await async_client.get(
            "/api/v1/metrics/monthly-flow",
            params={"start_period": "2026-02", "end_period": "2026-02"},
            headers=api_headers,
        )
    ).json()
    month = payload["items"][0]
    # Existing fields keep their values: one transfer row, transfer_net total.
    transfer_rows = [row for row in month["rows"] if row["section"] == "transfer"]
    assert [row["row"] for row in transfer_rows] == ["transfer_undetermined"]
    assert transfer_rows[0]["signed_amount"] == month["transfer_net"] == -1_210_000
    split = {row["row"]: row["signed_amount"] for row in month["transfer_rows"]}
    assert split == {
        "transfer_investment_savings": -1_300_000,
        "transfer_internal_move": 0,
        "transfer_undecided": 90_000,
    }
    assert sum(split.values()) == month["transfer_net"]
    assert month["transfer_investment_net"] == -1_000_000
    assert month["transfer_savings_net"] == -300_000
    assert month["transfer_undecided_activity_total"] == 90_000
    assert month["transfer_activity_total"] == 2_790_000
    assert month["transfer_undecided_share"] == round(90_000 / 2_790_000, 4)
    # Residual is untouched by transfer purposes.
    assert month["residual"] == 2_600_000


async def test_purpose_moves_to_a_reimport_replacement(
    db_session: AsyncSession,
) -> None:
    old_id, new_id = await _add(
        db_session,
        tx(date(2026, 2, 1), -500_000, tx_type="이체", merchant="old-text"),
        tx(date(2026, 2, 1), -500_000, tx_type="이체", merchant="new-text"),
    )
    db_session.add(TransferPurposeOverride(transaction_id=old_id, purpose="investment"))
    await db_session.commit()

    await move_transfer_purpose_override(
        db_session, old_transaction_id=old_id, new_transaction_id=new_id
    )
    await db_session.commit()
    assert await db_session.get(TransferPurposeOverride, old_id) is None
    moved = await db_session.get(TransferPurposeOverride, new_id)
    assert moved is not None and moved.purpose == "investment"
    # No-op when the old row carries no purpose.
    await move_transfer_purpose_override(
        db_session, old_transaction_id=old_id, new_transaction_id=new_id
    )
    assert (
        await db_session.get(TransferPurposeOverride, new_id)
    ).purpose == "investment"
