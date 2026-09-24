from datetime import date, time

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.installment_plan import InstallmentPlan
from app.models.installment_transaction_link import InstallmentTransactionLink
from app.models.transaction import Transaction


def _payment(label: str) -> Transaction:
    return Transaction(
        date=date(2026, 4, 30),
        time=time(9),
        type="지출",
        category_major="쇼핑",
        category_minor="전자기기",
        merchant="기기상점",
        description=label,
        amount=-120000,
        currency="KRW",
        payment_method="카드",
    )


@pytest.mark.parametrize("inactive_state", ["deleted", "merged"])
async def test_inactive_installment_link_preserved_until_explicit_unlink_and_replacement(
    async_client: AsyncClient,
    api_headers: dict[str, str],
    db_session: AsyncSession,
    inactive_state: str,
) -> None:
    plan = InstallmentPlan(
        display_name="기기 할부",
        merchant="기기상점",
        payment_method="카드",
        total_installments=3,
        monthly_amount=120000,
        first_payment_date=date(2026, 4, 30),
    )
    original = _payment("기존 원문")
    replacement = _payment("대체 후보 원문")
    db_session.add_all([plan, original, replacement])
    await db_session.flush()
    original_link = InstallmentTransactionLink(
        transaction_id=original.id,
        installment_plan_id=plan.id,
        installment_number=1,
        source="auto",
        memo="기존 연결 메모",
    )
    db_session.add(original_link)
    await db_session.commit()
    original_link_id = original_link.id

    initial_plans = await async_client.get("/api/v1/installment-plans")
    assert initial_plans.json()["items"][0]["linked_installment_count"] == 1
    forecast_path = "/api/v1/installments/forecast?as_of_date=2026-05-15&months=2"
    initial_forecast = await async_client.get(forecast_path)
    assert initial_forecast.json()["items"][0]["status"] == "observed"

    if inactive_state == "deleted":
        original.is_deleted = True
    else:
        original.merged_into_id = replacement.id
    await db_session.commit()

    plans = await async_client.get("/api/v1/installment-plans")
    assert plans.json()["items"][0]["linked_installment_count"] == 0
    patched = await async_client.patch(
        f"/api/v1/installment-plans/{plan.id}",
        headers=api_headers,
        json={"memo": "계획 메모 수정"},
    )
    assert patched.status_code == 200
    assert patched.json()["linked_installment_count"] == 0
    forecast = await async_client.get(forecast_path)
    assert forecast.json()["items"][0]["status"] == "missed"
    assert forecast.json()["items"][0]["transaction_id"] is None
    suggestions = await async_client.get("/api/v1/installment-transaction-suggestions")
    candidate = suggestions.json()["items"][0]
    assert candidate["transaction"]["transaction_id"] == replacement.id
    assert candidate["conflict_reason"] == "inactive_installment_link"
    assert candidate["conflicting_transaction_id"] == original.id
    assert candidate["conflicting_transaction_state"] == inactive_state
    assert candidate["is_usable"] is False
    original_read = await async_client.get(
        f"/api/v1/transactions/{original.id}/installment-link"
    )
    assert original_read.json()["link"]["memo"] == "기존 연결 메모"
    assert original_read.json()["link"]["source"] == "auto"

    link_payload = {
        "installment_plan_id": plan.id,
        "installment_number": 1,
        "memo": "새 연결 메모",
    }
    blocked = await async_client.put(
        f"/api/v1/transactions/{replacement.id}/installment-link",
        headers=api_headers,
        json=link_payload,
    )
    assert blocked.status_code == 409
    assert blocked.json()["detail"]["code"] == "inactive_installment_link"
    assert blocked.json()["detail"]["conflicting_transaction_id"] == original.id
    inactive_target = await async_client.put(
        f"/api/v1/transactions/{original.id}/installment-link",
        headers=api_headers,
        json=link_payload,
    )
    assert inactive_target.status_code == 409
    bulk_inactive_target = await async_client.put(
        "/api/v1/transactions/installment-links/bulk",
        headers=api_headers,
        json={
            "transaction_ids": [replacement.id, original.id],
            "installment_plan_id": plan.id,
            "start_installment_number": 2,
        },
    )
    assert bulk_inactive_target.status_code == 409
    retained = await db_session.get(InstallmentTransactionLink, original_link_id)
    assert retained is not None
    assert retained.memo == "기존 연결 메모"
    assert retained.source == "auto"
    assert (
        await db_session.scalar(
            select(func.count()).select_from(InstallmentTransactionLink)
        )
        == 1
    )

    # A restore after the suggestion was read invalidates the conditional unlink.
    original.is_deleted = False
    original.merged_into_id = None
    await db_session.commit()
    restored_plans = await async_client.get("/api/v1/installment-plans")
    restored_forecast = await async_client.get(forecast_path)
    assert restored_plans.json()["items"][0]["linked_installment_count"] == 1
    assert restored_forecast.json()["items"][0]["status"] == "observed"
    guarded_delete_path = (
        f"/api/v1/transactions/{original.id}/installment-link?require_inactive=true"
    )
    restored_conflict = await async_client.delete(
        guarded_delete_path, headers=api_headers
    )
    assert restored_conflict.status_code == 409
    restored_suggestions = await async_client.get(
        "/api/v1/installment-transaction-suggestions"
    )
    assert (
        restored_suggestions.json()["items"][0]["conflict_reason"]
        == "installment_number_already_linked"
    )

    if inactive_state == "deleted":
        original.is_deleted = True
    else:
        original.merged_into_id = replacement.id
    await db_session.commit()
    unauthenticated = await async_client.delete(guarded_delete_path)
    assert unauthenticated.status_code in {401, 403}
    removed = await async_client.delete(guarded_delete_path, headers=api_headers)
    assert removed.status_code == 204
    original_read_after = await async_client.get(
        f"/api/v1/transactions/{original.id}/installment-link"
    )
    assert original_read_after.json()["link"] is None
    released_suggestions = await async_client.get(
        "/api/v1/installment-transaction-suggestions"
    )
    assert released_suggestions.json()["items"][0]["is_usable"] is True
    connected = await async_client.put(
        f"/api/v1/transactions/{replacement.id}/installment-link",
        headers=api_headers,
        json=link_payload,
    )
    assert connected.status_code == 200
    assert connected.json()["memo"] == "새 연결 메모"
    assert connected.json()["source"] == "manual"
    await db_session.refresh(original)
    assert original.description == "기존 원문"
    assert original.is_deleted is (inactive_state == "deleted")
    assert original.merged_into_id == (
        replacement.id if inactive_state == "merged" else None
    )

    # Restoring raw data later cannot resurrect the removed mapping or displace
    # the explicitly confirmed replacement.
    original.is_deleted = False
    original.merged_into_id = None
    await db_session.commit()
    replacement_forecast = await async_client.get(forecast_path)
    assert replacement_forecast.json()["items"][0]["transaction_id"] == replacement.id
    replacement_plans = await async_client.get("/api/v1/installment-plans")
    assert replacement_plans.json()["items"][0]["linked_installment_count"] == 1
    reverse_conflict = await async_client.put(
        f"/api/v1/transactions/{original.id}/installment-link",
        headers=api_headers,
        json=link_payload,
    )
    assert reverse_conflict.status_code == 409
