from datetime import date, datetime, time

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.transaction import Transaction


def _expense(
    *,
    tx_date: date,
    description: str,
    amount: int = -100000,
    recurring_payment_kind: str | None = "installment",
) -> Transaction:
    now = datetime(2026, 5, 30, 0, 0, 0)
    return Transaction(
        date=tx_date,
        time=time(9, 0),
        type="지출",
        category_major="쇼핑",
        category_minor="전자제품",
        description=description,
        merchant=description,
        amount=amount,
        currency="KRW",
        payment_method="카드",
        recurring_payment_kind=recurring_payment_kind,
        source="import",
        created_at=now,
        updated_at=now,
    )


async def test_installment_plan_crud_linking_and_forecast(
    async_client: AsyncClient,
    api_headers: dict[str, str],
    db_session: AsyncSession,
) -> None:
    first = _expense(tx_date=date(2026, 5, 10), description="맥북")
    second = _expense(tx_date=date(2026, 6, 10), description="맥북")
    db_session.add_all([first, second])
    await db_session.commit()

    created = await async_client.post(
        "/api/v1/installment-plans",
        headers=api_headers,
        json={
            "display_name": "맥북 3개월 할부",
            "merchant": "맥북",
            "payment_method": "카드",
            "total_installments": 3,
            "monthly_amount": 100000,
            "first_payment_date": "2026-05-10",
            "memo": "테스트 할부",
        },
    )
    assert created.status_code == 201
    plan = created.json()
    assert plan["display_name"] == "맥북 3개월 할부"
    assert plan["status"] == "active"

    patched = await async_client.patch(
        f"/api/v1/installment-plans/{plan['id']}",
        headers=api_headers,
        json={"memo": "메모 수정"},
    )
    assert patched.status_code == 200
    assert patched.json()["memo"] == "메모 수정"

    linked = await async_client.put(
        f"/api/v1/transactions/{first.id}/installment-link",
        headers=api_headers,
        json={
            "installment_plan_id": plan["id"],
            "installment_number": 1,
            "memo": "1회차",
        },
    )
    assert linked.status_code == 200
    assert linked.json()["installment_number"] == 1
    assert linked.json()["source"] == "manual"

    link_read = await async_client.get(
        f"/api/v1/transactions/{first.id}/installment-link",
    )
    assert link_read.status_code == 200
    assert link_read.json()["link"]["installment_plan_id"] == plan["id"]

    bulk_linked = await async_client.put(
        "/api/v1/transactions/installment-links/bulk",
        headers=api_headers,
        json={
            "transaction_ids": [second.id],
            "installment_plan_id": plan["id"],
            "start_installment_number": 2,
            "memo": "bulk",
        },
    )
    assert bulk_linked.status_code == 200
    assert bulk_linked.json() == {"updated": 1}

    mappings = await async_client.get(
        "/api/v1/installment-transaction-links",
        params={"linked": "linked"},
    )
    assert mappings.status_code == 200
    assert mappings.json()["total"] == 2
    assert {
        item["link"]["installment_number"]
        for item in mappings.json()["items"]
    } == {1, 2}

    forecast = await async_client.get(
        "/api/v1/installments/forecast",
        params={"as_of_date": "2026-06-15", "months": 3},
    )
    assert forecast.status_code == 200
    payload = forecast.json()
    assert [item["status"] for item in payload["items"]] == [
        "observed",
        "observed",
        "projected",
    ]
    assert payload["items"][2]["due_date"] == "2026-07-10"
    assert payload["monthly_summary"] == [
        {
            "period": "2026-05",
            "observed_total": 100000,
            "projected_total": 0,
            "missed_total": 0,
        },
        {
            "period": "2026-06",
            "observed_total": 100000,
            "projected_total": 0,
            "missed_total": 0,
        },
        {
            "period": "2026-07",
            "observed_total": 0,
            "projected_total": 100000,
            "missed_total": 0,
        },
    ]


async def test_installment_forecast_marks_past_unlinked_installments_as_missed(
    async_client: AsyncClient,
    api_headers: dict[str, str],
) -> None:
    created = await async_client.post(
        "/api/v1/installment-plans",
        headers=api_headers,
        json={
            "display_name": "가전 2개월 할부",
            "merchant": "가전",
            "payment_method": "카드",
            "total_installments": 2,
            "monthly_amount": 50000,
            "first_payment_date": "2026-04-10",
        },
    )
    assert created.status_code == 201

    forecast = await async_client.get(
        "/api/v1/installments/forecast",
        params={"as_of_date": "2026-06-15", "months": 3},
    )

    assert forecast.status_code == 200
    assert [item["status"] for item in forecast.json()["items"]] == [
        "missed",
        "missed",
    ]


async def test_installment_link_validates_installment_number(
    async_client: AsyncClient,
    api_headers: dict[str, str],
    db_session: AsyncSession,
) -> None:
    transaction = _expense(tx_date=date(2026, 5, 10), description="카메라")
    db_session.add(transaction)
    await db_session.commit()
    created = await async_client.post(
        "/api/v1/installment-plans",
        headers=api_headers,
        json={
            "display_name": "카메라 2개월 할부",
            "merchant": "카메라",
            "payment_method": "카드",
            "total_installments": 2,
            "monthly_amount": 80000,
            "first_payment_date": "2026-05-10",
        },
    )
    assert created.status_code == 201

    linked = await async_client.put(
        f"/api/v1/transactions/{transaction.id}/installment-link",
        headers=api_headers,
        json={
            "installment_plan_id": created.json()["id"],
            "installment_number": 3,
        },
    )

    assert linked.status_code == 422


async def test_installment_bulk_link_rejects_duplicate_transactions(
    async_client: AsyncClient,
    api_headers: dict[str, str],
    db_session: AsyncSession,
) -> None:
    transaction = _expense(tx_date=date(2026, 5, 10), description="태블릿")
    db_session.add(transaction)
    await db_session.commit()
    created = await async_client.post(
        "/api/v1/installment-plans",
        headers=api_headers,
        json={
            "display_name": "태블릿 2개월 할부",
            "merchant": "태블릿",
            "payment_method": "카드",
            "total_installments": 2,
            "monthly_amount": 80000,
            "first_payment_date": "2026-05-10",
        },
    )
    assert created.status_code == 201

    response = await async_client.put(
        "/api/v1/transactions/installment-links/bulk",
        headers=api_headers,
        json={
            "transaction_ids": [transaction.id, transaction.id],
            "installment_plan_id": created.json()["id"],
            "start_installment_number": 1,
        },
    )

    assert response.status_code == 422


async def test_installment_plan_cannot_shrink_below_linked_numbers(
    async_client: AsyncClient,
    api_headers: dict[str, str],
    db_session: AsyncSession,
) -> None:
    transaction = _expense(tx_date=date(2026, 6, 10), description="모니터")
    db_session.add(transaction)
    await db_session.commit()
    created = await async_client.post(
        "/api/v1/installment-plans",
        headers=api_headers,
        json={
            "display_name": "모니터 3개월 할부",
            "merchant": "모니터",
            "payment_method": "카드",
            "total_installments": 3,
            "monthly_amount": 70000,
            "first_payment_date": "2026-05-10",
        },
    )
    assert created.status_code == 201
    plan_id = created.json()["id"]
    linked = await async_client.put(
        f"/api/v1/transactions/{transaction.id}/installment-link",
        headers=api_headers,
        json={"installment_plan_id": plan_id, "installment_number": 2},
    )
    assert linked.status_code == 200

    response = await async_client.patch(
        f"/api/v1/installment-plans/{plan_id}",
        headers=api_headers,
        json={"total_installments": 1},
    )

    assert response.status_code == 422
