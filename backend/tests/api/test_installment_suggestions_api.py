from datetime import date, datetime, time

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.installment_transaction_link import InstallmentTransactionLink
from app.models.transaction import Transaction


def _expense(
    *,
    tx_date: date,
    description: str,
    merchant: str,
    amount: int,
) -> Transaction:
    now = datetime(2026, 5, 30, 0, 0, 0)
    return Transaction(
        date=tx_date,
        time=time(9, 0),
        type="지출",
        category_major="쇼핑",
        category_minor="전자제품",
        description=description,
        merchant=merchant,
        amount=amount,
        currency="KRW",
        payment_method="카드",
        recurring_payment_kind="installment",
        source="import",
        created_at=now,
        updated_at=now,
    )


async def test_installment_suggestions_return_read_only_candidates(
    async_client: AsyncClient,
    api_headers: dict[str, str],
    db_session: AsyncSession,
) -> None:
    transactions = [
        _expense(
            tx_date=date(2026, 5, 10),
            description="애플 결제 1",
            merchant="애플",
            amount=-99500,
        ),
        _expense(
            tx_date=date(2026, 6, 10),
            description="애플 결제 2",
            merchant="애플",
            amount=-100200,
        ),
        _expense(
            tx_date=date(2026, 7, 12),
            description="애플 결제 3",
            merchant="애플",
            amount=-100000,
        ),
    ]
    db_session.add_all(transactions)
    await db_session.commit()
    created = await async_client.post(
        "/api/v1/installment-plans",
        headers=api_headers,
        json={
            "display_name": "맥북 3개월 할부",
            "merchant": "애플",
            "payment_method": "카드",
            "total_installments": 3,
            "monthly_amount": 100000,
            "first_payment_date": "2026-05-10",
        },
    )
    assert created.status_code == 201

    response = await async_client.get(
        "/api/v1/installment-transaction-suggestions",
        params={"installment_plan_id": created.json()["id"], "page": 1},
    )
    links_after_suggestion = await async_client.get(
        "/api/v1/installment-transaction-links",
        params={"linked": "linked"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] == 3
    assert [item["suggested_installment_number"] for item in payload["items"]] == [
        1,
        2,
        3,
    ]
    assert [item["expected_billing_date"] for item in payload["items"]] == [
        "2026-05-10",
        "2026-06-10",
        "2026-07-10",
    ]
    assert payload["items"][0]["installment_plan_display_name"] == "맥북 3개월 할부"
    assert payload["items"][0]["transaction"]["merchant"] == "애플"
    assert payload["items"][0]["amount_delta"] == 500
    assert payload["items"][2]["billing_day_delta"] == 2
    assert payload["items"][0]["confidence"] == "high"
    assert "same_merchant" in payload["items"][0]["reason_labels"]
    assert payload["items"][0]["conflict_reason"] is None
    assert payload["items"][0]["is_usable"] is True
    assert links_after_suggestion.status_code == 200
    assert links_after_suggestion.json()["total"] == 0


async def test_installment_suggestions_expose_conflicts_without_linked_duplicates(
    async_client: AsyncClient,
    api_headers: dict[str, str],
    db_session: AsyncSession,
) -> None:
    occupied = _expense(
        tx_date=date(2026, 6, 9),
        description="애플 기존 연결",
        merchant="애플",
        amount=-100000,
    )
    duplicate = _expense(
        tx_date=date(2026, 6, 10),
        description="애플 이미 연결된 거래",
        merchant="애플",
        amount=-100000,
    )
    candidate = _expense(
        tx_date=date(2026, 6, 10),
        description="애플 새 후보",
        merchant="애플",
        amount=-100000,
    )
    db_session.add_all([occupied, duplicate, candidate])
    await db_session.commit()
    created = await async_client.post(
        "/api/v1/installment-plans",
        headers=api_headers,
        json={
            "display_name": "맥북 3개월 할부",
            "merchant": "애플",
            "payment_method": "카드",
            "total_installments": 3,
            "monthly_amount": 100000,
            "first_payment_date": "2026-05-10",
        },
    )
    assert created.status_code == 201
    plan_id = created.json()["id"]
    db_session.add_all(
        [
            InstallmentTransactionLink(
                transaction_id=occupied.id,
                installment_plan_id=plan_id,
                installment_number=2,
                source="manual",
            ),
            InstallmentTransactionLink(
                transaction_id=duplicate.id,
                installment_plan_id=plan_id,
                installment_number=1,
                source="manual",
            ),
        ]
    )
    await db_session.commit()

    response = await async_client.get(
        "/api/v1/installment-transaction-suggestions",
        params={"installment_plan_id": plan_id},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] == 1
    assert payload["items"][0]["transaction"]["transaction_id"] == candidate.id
    assert payload["items"][0]["suggested_installment_number"] == 2
    assert payload["items"][0]["is_usable"] is False
    assert (
        payload["items"][0]["conflict_reason"]
        == "installment_number_already_linked"
    )


async def test_installment_suggestions_reject_malformed_inputs(
    async_client: AsyncClient,
) -> None:
    invalid_page = await async_client.get(
        "/api/v1/installment-transaction-suggestions",
        params={"page": 0},
    )
    invalid_per_page = await async_client.get(
        "/api/v1/installment-transaction-suggestions",
        params={"per_page": 201},
    )
    unknown_plan = await async_client.get(
        "/api/v1/installment-transaction-suggestions",
        params={"installment_plan_id": 999999},
    )

    assert invalid_page.status_code == 422
    assert invalid_per_page.status_code == 422
    assert unknown_plan.status_code == 404
