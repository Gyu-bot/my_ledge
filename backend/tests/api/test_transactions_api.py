from datetime import date, datetime, time

from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.transaction import Transaction


def _transaction(
    *,
    tx_date: date,
    tx_time: time,
    tx_type: str,
    category_major: str,
    category_minor: str | None,
    description: str,
    merchant: str | None = None,
    amount: int,
    payment_method: str | None,
    memo: str | None = None,
    category_major_user: str | None = None,
    category_minor_user: str | None = None,
    is_deleted: bool = False,
    merged_into_id: int | None = None,
    source: str = "import",
) -> Transaction:
    now = datetime(2026, 3, 24, 0, 0, 0)
    return Transaction(
        date=tx_date,
        time=tx_time,
        type=tx_type,
        category_major=category_major,
        category_minor=category_minor,
        category_major_user=category_major_user,
        category_minor_user=category_minor_user,
        description=description,
        merchant=merchant or description,
        amount=amount,
        currency="KRW",
        payment_method=payment_method,
        memo=memo,
        is_deleted=is_deleted,
        merged_into_id=merged_into_id,
        source=source,
        created_at=now,
        updated_at=now,
    )


async def test_list_transactions_applies_default_filters_and_pagination(
    async_client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    db_session.add_all(
        [
            _transaction(
                tx_date=date(2026, 3, 10),
                tx_time=time(12, 0),
                tx_type="지출",
                category_major="교통",
                category_minor="택시",
                description="카카오택시",
                amount=-10000,
                payment_method="카드 A",
            ),
            _transaction(
                tx_date=date(2026, 3, 9),
                tx_time=time(12, 0),
                tx_type="지출",
                category_major="식비",
                category_minor="외식",
                description="식당",
                amount=-20000,
                payment_method="카드 B",
            ),
            _transaction(
                tx_date=date(2026, 3, 8),
                tx_time=time(12, 0),
                tx_type="수입",
                category_major="급여",
                category_minor=None,
                description="월급",
                amount=3000000,
                payment_method="계좌 A",
            ),
            _transaction(
                tx_date=date(2026, 3, 7),
                tx_time=time(12, 0),
                tx_type="이체",
                category_major="저축",
                category_minor=None,
                description="적금이체",
                amount=-500000,
                payment_method="계좌 A",
            ),
            _transaction(
                tx_date=date(2026, 3, 6),
                tx_time=time(12, 0),
                tx_type="지출",
                category_major="기타",
                category_minor=None,
                description="삭제될 거래",
                amount=-1000,
                payment_method="카드 C",
                is_deleted=True,
            ),
            _transaction(
                tx_date=date(2026, 3, 5),
                tx_time=time(12, 0),
                tx_type="지출",
                category_major="기타",
                category_minor=None,
                description="병합된 거래",
                amount=-2000,
                payment_method="카드 C",
                merged_into_id=1,
            ),
        ]
    )
    await db_session.commit()

    response = await async_client.get("/api/v1/transactions", params={"page": 1, "per_page": 2})

    assert response.status_code == 200
    assert response.json()["total"] == 4
    assert len(response.json()["items"]) == 2
    assert response.json()["items"][0]["description"] == "카카오택시"


async def test_list_transactions_supports_is_edited_and_search(
    async_client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    db_session.add(
        _transaction(
            tx_date=date(2026, 3, 10),
            tx_time=time(12, 0),
            tx_type="지출",
            category_major="미분류",
            category_minor="미분류",
            category_major_user="식비",
            category_minor_user="배달",
            description="쿠팡이츠",
            amount=-23000,
            payment_method="카드 A",
            memo="배달음식",
        )
    )
    await db_session.commit()

    response = await async_client.get(
        "/api/v1/transactions",
        params={"is_edited": "true", "search": "배달"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] == 1
    assert payload["items"][0]["effective_category_major"] == "식비"
    assert payload["items"][0]["effective_category_minor"] == "배달"
    assert payload["items"][0]["cost_kind"] is None
    assert payload["items"][0]["fixed_cost_necessity"] is None


async def test_list_transactions_can_include_deleted_and_merged_rows(
    async_client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    db_session.add_all(
        [
            _transaction(
                tx_date=date(2026, 3, 10),
                tx_time=time(12, 0),
                tx_type="지출",
                category_major="교통",
                category_minor="택시",
                description="정상 거래",
                amount=-10000,
                payment_method="카드 A",
            ),
            _transaction(
                tx_date=date(2026, 3, 9),
                tx_time=time(12, 0),
                tx_type="지출",
                category_major="기타",
                category_minor=None,
                description="삭제 거래",
                amount=-1000,
                payment_method="카드 B",
                is_deleted=True,
            ),
            _transaction(
                tx_date=date(2026, 3, 8),
                tx_time=time(12, 0),
                tx_type="지출",
                category_major="기타",
                category_minor=None,
                description="병합 거래",
                amount=-2000,
                payment_method="카드 C",
                merged_into_id=1,
            ),
        ]
    )
    await db_session.commit()

    response = await async_client.get(
        "/api/v1/transactions",
        params={
            "include_deleted": "true",
            "include_merged": "true",
            "page": 1,
            "per_page": 10,
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] == 3
    assert [item["description"] for item in payload["items"]] == [
        "정상 거래",
        "삭제 거래",
        "병합 거래",
    ]
    assert payload["items"][1]["is_deleted"] is True
    assert payload["items"][2]["merged_into_id"] == 1


async def test_summary_and_breakdown_endpoints_use_effective_rules(
    async_client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    rows = [
        _transaction(
            tx_date=date(2026, 3, 1),
            tx_time=time(10, 0),
            tx_type="지출",
            category_major="교통",
            category_minor="택시",
            description="택시",
            amount=-100,
            payment_method="카드 A",
        ),
        _transaction(
            tx_date=date(2026, 3, 2),
            tx_time=time(10, 0),
            tx_type="지출",
            category_major="교통",
            category_minor="택시",
            description="택시 취소",
            amount=20,
            payment_method="카드 A",
        ),
        _transaction(
            tx_date=date(2026, 2, 5),
            tx_time=time(10, 0),
            tx_type="지출",
            category_major="미분류",
            category_minor="미분류",
            category_major_user="식비",
            category_minor_user="외식",
            description="식당",
            amount=-50,
            payment_method="카드 B",
        ),
        _transaction(
            tx_date=date(2026, 3, 3),
            tx_time=time(10, 0),
            tx_type="수입",
            category_major="급여",
            category_minor=None,
            description="급여",
            amount=1000,
            payment_method="계좌 A",
        ),
        _transaction(
            tx_date=date(2026, 3, 4),
            tx_time=time(10, 0),
            tx_type="이체",
            category_major="저축",
            category_minor=None,
            description="적금",
            amount=-300,
            payment_method="계좌 A",
        ),
    ]
    db_session.add_all(rows)
    await db_session.commit()

    summary = await async_client.get(
        "/api/v1/transactions/summary",
        params={
            "start_date": "2026-02-01",
            "end_date": "2026-03-31",
            "group_by": "month",
            "type": "지출",
        },
    )
    by_category = await async_client.get(
        "/api/v1/transactions/by-category",
        params={
            "start_date": "2026-02-01",
            "end_date": "2026-03-31",
            "level": "major",
            "type": "지출",
        },
    )
    by_category_timeline = await async_client.get(
        "/api/v1/transactions/by-category/timeline",
        params={
            "start_date": "2026-02-01",
            "end_date": "2026-03-31",
            "level": "major",
            "type": "지출",
        },
    )
    payment_methods = await async_client.get(
        "/api/v1/transactions/payment-methods",
        params={"start_date": "2026-02-01", "end_date": "2026-03-31"},
    )

    assert summary.status_code == 200
    assert summary.json() == {
        "items": [
            {"period": "2026-02", "amount": -50},
            {"period": "2026-03", "amount": -80},
        ]
    }
    assert by_category.status_code == 200
    assert by_category.json() == {
        "items": [
            {"category": "교통", "amount": -80},
            {"category": "식비", "amount": -50},
        ]
    }
    assert by_category_timeline.status_code == 200
    assert by_category_timeline.json() == {
        "items": [
            {"period": "2026-02", "category": "식비", "amount": -50},
            {"period": "2026-03", "category": "교통", "amount": -80},
        ]
    }
    assert payment_methods.status_code == 200
    assert payment_methods.json() == {
        "items": [
            {"payment_method": "카드 A", "amount": -80},
            {"payment_method": "카드 B", "amount": -50},
            {"payment_method": "계좌 A", "amount": 700},
        ]
    }


async def test_write_endpoints_update_transactions_and_require_api_key(
    async_client: AsyncClient,
    api_headers: dict[str, str],
    db_session: AsyncSession,
) -> None:
    unauthorized = await async_client.post(
        "/api/v1/transactions",
        json={
            "date": "2026-03-15",
            "time": "12:00:00",
            "type": "지출",
            "category_major": "식비",
            "category_minor": "외식",
            "description": "점심",
            "amount": -15000,
            "payment_method": "현금",
        },
    )
    assert unauthorized.status_code == 401

    create_response = await async_client.post(
        "/api/v1/transactions",
        headers=api_headers,
        json={
            "date": "2026-03-15",
            "time": "12:00:00",
            "type": "지출",
            "category_major": "식비",
            "category_minor": "외식",
            "description": "점심",
            "amount": -15000,
            "payment_method": "현금",
        },
    )
    assert create_response.status_code == 201
    created_id = create_response.json()["id"]
    assert create_response.json()["source"] == "manual"
    assert create_response.json()["description"] == "점심"
    assert create_response.json()["merchant"] == "점심"
    assert create_response.json()["cost_kind"] == "variable"

    patch_response = await async_client.patch(
        f"/api/v1/transactions/{created_id}",
        headers=api_headers,
        json={
            "category_major_user": "생활/잡화",
            "category_minor_user": "생필품",
            "merchant": "회사식당",
            "memo": "수정 메모",
        },
    )
    assert patch_response.status_code == 200
    assert patch_response.json()["effective_category_major"] == "생활/잡화"
    assert patch_response.json()["description"] == "점심"
    assert patch_response.json()["merchant"] == "회사식당"
    assert patch_response.json()["is_edited"] is True

    second = _transaction(
        tx_date=date(2026, 3, 16),
        tx_time=time(13, 0),
        tx_type="지출",
        category_major="미분류",
        category_minor="미분류",
        description="다른 거래",
        amount=-5000,
        payment_method="카드 A",
    )
    db_session.add(second)
    await db_session.commit()

    bulk_response = await async_client.patch(
        "/api/v1/transactions/bulk-update",
        headers=api_headers,
        json={
            "ids": [created_id, second.id],
            "merchant": "공통 거래처",
            "category_major_user": "식비",
            "category_minor_user": "배달",
            "cost_kind": "fixed",
            "fixed_cost_necessity": "essential",
            "memo": "일괄 메모",
        },
    )
    assert bulk_response.status_code == 200
    assert bulk_response.json() == {"updated": 2}

    delete_response = await async_client.delete(
        f"/api/v1/transactions/{created_id}",
        headers=api_headers,
    )
    assert delete_response.status_code == 204

    restore_response = await async_client.post(
        f"/api/v1/transactions/{created_id}/restore",
        headers=api_headers,
    )
    assert restore_response.status_code == 200
    assert restore_response.json()["is_deleted"] is False

    stored = await db_session.scalar(select(Transaction).where(Transaction.id == created_id))
    assert stored is not None
    assert stored.category_major_user == "식비"
    assert stored.category_minor_user == "배달"
    assert stored.description == "점심"
    assert stored.merchant == "공통 거래처"
    assert stored.cost_kind == "fixed"
    assert stored.fixed_cost_necessity == "essential"
    assert stored.memo == "일괄 메모"
    assert stored.is_deleted is False


async def test_merge_endpoint_returns_501(
    async_client: AsyncClient,
    api_headers: dict[str, str],
) -> None:
    response = await async_client.post(
        "/api/v1/transactions/merge",
        headers=api_headers,
        json={
            "source_ids": [1, 2],
            "target": {
                "date": "2026-03-09",
                "time": "06:10:00",
                "type": "지출",
                "category_major": "데이트",
                "category_minor": "데이트",
                "description": "병합",
                "amount": -1000,
                "payment_method": "카드 A",
            },
        },
    )

    assert response.status_code == 501
