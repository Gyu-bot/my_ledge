"""T066 사람 확인 정리와 관측 계약. 합성 자료만 사용한다."""

from datetime import date, datetime, timezone, time

from sqlalchemy import select

from app.models.nature_axes import RecurringCommitment, TransactionNatureOverride
from app.models.transaction import Transaction
from app.services.metric_views import TRANSACTION_NATURE_VIEW
from app.services.nature_axes_service import find_rule_commitment_id

BASE = "/api/v1/nature/recurring-commitments"


def commitment(merchant="Synthetic Plan01", **kw):
    return RecurringCommitment(
        match_scope="merchant",
        merchant=merchant,
        category_major="synthetic",
        origin="migration",
        **kw,
    )


def tx(merchant="Synthetic Plan01", **kw):
    return Transaction(
        date=date(2031, 1, 10),
        time=time(12),
        type="지출",
        merchant=merchant,
        description="synthetic",
        category_major="synthetic",
        amount=-1234,
        **kw,
    )


async def test_rule_priority_literal_prefix_and_dates(db_session):
    category = RecurringCommitment(
        match_scope="category", category_major="synthetic", origin="user"
    )
    short = commitment("synthetic", merchant_match="prefix")
    long = commitment("Synthetic Plan", merchant_match="prefix")
    same_prefix = commitment("Synthetic Plan", merchant_match="prefix")
    exact = commitment()
    duplicate = commitment()
    wildcard = commitment("%_", merchant_match="prefix")
    db_session.add_all([category, short, long, same_prefix, exact, duplicate, wildcard])
    rows = [tx(), tx(" SYNTHETIC\t Plan02 "), tx("%_abc"), tx("other")]
    db_session.add_all(rows)
    await db_session.commit()
    for row, expected in zip(
        rows, [exact.id, long.id, wildcard.id, category.id], strict=True
    ):
        python_id = await find_rule_commitment_id(
            db_session,
            merchant=row.merchant,
            category_major=row.category_major,
            category_minor=None,
            on_date=row.date,
        )
        sql_id = await db_session.scalar(
            select(TRANSACTION_NATURE_VIEW.c.recurring_commitment_id).where(
                TRANSACTION_NATURE_VIEW.c.transaction_id == row.id
            )
        )
        assert python_id == sql_id == expected
    long.end_date = date(2030, 12, 31)
    same_prefix.end_date = date(2030, 12, 31)
    short.start_date = date(2032, 1, 1)
    await db_session.commit()
    assert (
        await find_rule_commitment_id(
            db_session,
            merchant=rows[1].merchant,
            category_major="synthetic",
            category_minor=None,
            on_date=rows[1].date,
        )
        == category.id
    )
    assert (
        await find_rule_commitment_id(
            db_session,
            merchant=rows[0].merchant,
            category_major="synthetic",
            category_minor="different",
            on_date=rows[0].date,
        )
        is None
    )


async def test_observations_suggestions_exclude_deleted_merged(
    async_client, api_headers, db_session
):
    a, b, c = (
        commitment(),
        commitment(" synthetic plan02 "),
        commitment(
            "Synthetic Plan03", attributes_confirmed_at=datetime.now(timezone.utc)
        ),
    )
    db_session.add_all([a, b, c])
    await db_session.flush()
    one = tx()
    deleted = tx(is_deleted=True)
    merged = tx(merged_into_id=None)
    db_session.add_all([one, deleted])
    await db_session.flush()
    merged.merged_into_id = one.id
    db_session.add(merged)
    await db_session.commit()
    body = (await async_client.get(BASE, headers=api_headers)).json()
    by_id = {r["id"]: r for r in body["items"]}
    assert by_id[a.id]["observed_transaction_count"] == 1
    assert by_id[a.id]["first_observed_date"] == "2031-01-10"
    assert by_id[b.id]["low_observation"] is True
    assert by_id[c.id]["low_observation"] is False
    assert body["merge_suggestions"] == [
        {
            "ids": [a.id, b.id, c.id],
            "suggested_prefix": "syntheticplan",
            "target_id": a.id,
        }
    ]


async def test_merge_preserves_target_conflict_and_moves_overrides(
    async_client, api_headers, db_session
):
    a = commitment(
        start_date=date(2031, 1, 1),
        adjustability="protected",
        attributes_confirmed_at=datetime.now(timezone.utc),
    )
    b = commitment(
        "Synthetic Plan02", start_date=date(2030, 1, 1), adjustability="adjustable"
    )
    row = tx("different")
    db_session.add_all([a, b, row])
    await db_session.flush()
    db_session.add(
        TransactionNatureOverride(
            transaction_id=row.id,
            commitment_id=b.id,
            source="user",
            adjustability="adjustable",
        )
    )
    await db_session.commit()
    response = await async_client.post(
        BASE + "/merge",
        headers=api_headers,
        json={
            "target_id": a.id,
            "source_ids": [b.id],
            "merchant_match": "prefix",
            "merchant": "Synthetic Plan",
        },
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["start_date"] == "2030-01-01"
    assert body["attributes_confirmed_at"] is None
    assert body["adjustability"] == "protected"
    assert body["origin"] == "migration"
    assert await db_session.get(RecurringCommitment, b.id) is None
    override = await db_session.get(TransactionNatureOverride, row.id)
    await db_session.refresh(override)
    assert override.commitment_id == a.id and override.adjustability == "adjustable"


async def test_bulk_delete_atomic_missing_id_and_override_semantics(
    async_client, api_headers, db_session
):
    a, b = commitment(), commitment("Synthetic Plan02")
    first, second = tx(), tx("Synthetic Plan02")
    db_session.add_all([a, b, first, second])
    await db_session.flush()
    db_session.add_all(
        [
            TransactionNatureOverride(
                transaction_id=first.id, commitment_id=a.id, source="user"
            ),
            TransactionNatureOverride(
                transaction_id=second.id,
                commitment_id=b.id,
                adjustability="protected",
                source="user",
            ),
        ]
    )
    await db_session.commit()
    bad = await async_client.post(
        BASE + "/bulk-delete", headers=api_headers, json={"ids": [a.id, 999999]}
    )
    assert bad.status_code == 404
    assert await db_session.get(RecurringCommitment, a.id) is not None
    good = await async_client.post(
        BASE + "/bulk-delete", headers=api_headers, json={"ids": [a.id, b.id]}
    )
    assert good.status_code == 204
    assert (
        await db_session.scalar(
            select(TransactionNatureOverride).where(
                TransactionNatureOverride.transaction_id == first.id
            )
        )
        is None
    )
    override = await db_session.get(TransactionNatureOverride, second.id)
    await db_session.refresh(override)
    assert override.commitment_id is None and override.adjustability == "protected"


async def test_validation_auth_and_same_category(async_client, api_headers, db_session):
    for route, body in [
        ("merge", {"target_id": 1, "source_ids": [2]}),
        ("bulk-delete", {"ids": [1]}),
    ]:
        assert (
            await async_client.post(BASE + "/" + route, json=body)
        ).status_code == 401
    for body in [{"ids": []}, {"ids": [1, 1]}, {"ids": [-1]}]:
        assert (
            await async_client.post(
                BASE + "/bulk-delete", headers=api_headers, json=body
            )
        ).status_code == 422
    for body in [
        {"target_id": 1, "source_ids": [1]},
        {"target_id": 1, "source_ids": []},
        {"target_id": 1, "source_ids": [2, 2]},
    ]:
        assert (
            await async_client.post(BASE + "/merge", headers=api_headers, json=body)
        ).status_code == 422
    for scope, merchant in [("merchant", "a "), ("category", None), ("merchant", "  ")]:
        response = await async_client.post(
            BASE,
            headers=api_headers,
            json={
                "match_scope": scope,
                "category_major": "synthetic",
                "merchant": merchant,
                "merchant_match": "prefix",
            },
        )
        assert response.status_code == 422
    a, b = commitment(), commitment("other", category_minor="different")
    db_session.add_all([a, b])
    await db_session.commit()
    assert (
        await async_client.post(
            BASE + "/merge",
            headers=api_headers,
            json={"target_id": a.id, "source_ids": [b.id]},
        )
    ).status_code == 422
    assert (
        await async_client.patch(
            BASE + f"/{a.id}", headers=api_headers, json={"merchant_match": None}
        )
    ).status_code == 422
