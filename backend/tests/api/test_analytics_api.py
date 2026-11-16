from legacy_nature_seed import legacy_transaction
from datetime import date, datetime, time

from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.settlement_group import SettlementMatch, SettlementMatchStatus
from app.models.transaction import Transaction
from app.services import analytics_service as analytics_service_module


_CONTRACT_FIELDS = {
    "total_outflow",
    "contract",
    "month_status",
    # T057 comparison contract (additive fields)
    "comparison",
    "baseline_amount",
    "baseline_change_amount",
}


def _legacy_shape(payload):
    """Drop fields added by the T054/T057 contracts; legacy fields stay exact."""
    if isinstance(payload, dict):
        return {
            key: _legacy_shape(value)
            for key, value in payload.items()
            if key not in _CONTRACT_FIELDS
        }
    if isinstance(payload, list):
        return [_legacy_shape(item) for item in payload]
    return payload


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
    category_major_user: str | None = None,
    category_minor_user: str | None = None,
    cost_kind: str | None = None,
    fixed_cost_necessity: str | None = None,
    spend_necessity: str | None = None,
    recurring_payment_kind: str | None = None,
    is_deleted: bool = False,
    merged_into_id: int | None = None,
) -> Transaction:
    now = datetime(2026, 3, 24, 0, 0, 0)
    return legacy_transaction(
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
        cost_kind=cost_kind,
        fixed_cost_necessity=fixed_cost_necessity,
        spend_necessity=spend_necessity,
        recurring_payment_kind=recurring_payment_kind,
        is_deleted=is_deleted,
        merged_into_id=merged_into_id,
        source="import",
        created_at=now,
        updated_at=now,
    )


async def _settlement_match_count(db_session: AsyncSession) -> int:
    return len(
        (
            await db_session.execute(
                select(SettlementMatch.id).order_by(SettlementMatch.id.asc())
            )
        )
        .scalars()
        .all()
    )


async def test_monthly_cashflow_endpoint_returns_monthly_series(
    async_client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    db_session.add_all(
        [
            _transaction(
                tx_date=date(2026, 1, 5),
                tx_time=time(9, 0),
                tx_type="수입",
                category_major="급여",
                category_minor=None,
                description="월급",
                amount=1000,
                payment_method="계좌 A",
            ),
            _transaction(
                tx_date=date(2026, 1, 6),
                tx_time=time(10, 0),
                tx_type="지출",
                category_major="식비",
                category_minor="외식",
                description="점심",
                amount=-400,
                payment_method="카드 A",
            ),
            _transaction(
                tx_date=date(2026, 1, 7),
                tx_time=time(11, 0),
                tx_type="이체",
                category_major="저축",
                category_minor=None,
                description="적금",
                amount=-200,
                payment_method="계좌 A",
            ),
        ]
    )
    await db_session.commit()

    response = await async_client.get(
        "/api/v1/analytics/monthly-cashflow",
        params={"start_date": "2026-01-01", "end_date": "2026-01-31"},
    )

    assert response.status_code == 200
    assert _legacy_shape(response.json()) == {
        "items": [
            {
                "period": "2026-01",
                "income": 1000,
                "expense": 400,
                "transfer": 200,
                "net_cashflow": 600,
                # T057: the data ends on 2026-01-07 (in-progress) -> no ratio.
                "savings_rate": None,
            }
        ]
    }


async def test_monthly_cashflow_endpoint_uses_confirmed_settlement_net_amount(
    async_client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    purchase = _transaction(
        tx_date=date(2026, 1, 31),
        tx_time=time(10, 0),
        tx_type="지출",
        category_major="식비",
        category_minor="외식",
        description="저녁",
        merchant="식당",
        amount=-600,
        payment_method="카드 A",
    )
    refund = _transaction(
        tx_date=date(2026, 2, 1),
        tx_time=time(10, 30),
        tx_type="지출",
        category_major="식비",
        category_minor="외식",
        description="저녁 부분 환불",
        merchant="식당",
        amount=100,
        payment_method="카드 A",
    )
    db_session.add_all(
        [
            _transaction(
                tx_date=date(2026, 1, 5),
                tx_time=time(9, 0),
                tx_type="수입",
                category_major="급여",
                category_minor=None,
                description="월급",
                amount=1500,
                payment_method="계좌 A",
            ),
            purchase,
            refund,
        ]
    )
    await db_session.commit()
    db_session.add(
        SettlementMatch(
            original_transaction_id=purchase.id,
            settlement_transaction_id=refund.id,
            status=SettlementMatchStatus.AUTO_CONFIRMED.value,
            matched_amount=100,
            matched_at=datetime(2026, 2, 1, 10, 31, 0),
        )
    )
    await db_session.commit()

    response = await async_client.get(
        "/api/v1/analytics/monthly-cashflow",
        params={"start_date": "2026-01-01", "end_date": "2026-02-28"},
    )

    assert response.status_code == 200
    # T055 (audit F03): a confirmed refund stays in its posting month. The
    # January purchase is not rewritten retroactively; February nets the refund.
    assert _legacy_shape(response.json()) == {
        "items": [
            {
                "period": "2026-01",
                "income": 1500,
                "expense": 600,
                "transfer": 0,
                "net_cashflow": 900,
                "savings_rate": 0.6,
            },
            {
                "period": "2026-02",
                "income": 0,
                "expense": -100,
                "transfer": 0,
                "net_cashflow": 100,
                "savings_rate": None,
            },
        ]
    }


async def test_monthly_cashflow_endpoint_keeps_confirmed_settlement_read_only(
    async_client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    purchase = _transaction(
        tx_date=date(2026, 1, 31),
        tx_time=time(10, 0),
        tx_type="지출",
        category_major="생활",
        category_minor="쇼핑",
        description="원결제",
        merchant="상점A",
        amount=-180_000,
        payment_method="카드 A",
    )
    refund = _transaction(
        tx_date=date(2026, 2, 1),
        tx_time=time(12, 30),
        tx_type="지출",
        category_major="생활",
        category_minor="쇼핑",
        description="부분 환불",
        merchant="상점A",
        amount=80_000,
        payment_method="카드 A",
    )
    db_session.add_all([purchase, refund])
    await db_session.commit()
    db_session.add(
        SettlementMatch(
            original_transaction_id=purchase.id,
            settlement_transaction_id=refund.id,
            status=SettlementMatchStatus.AUTO_CONFIRMED.value,
            matched_amount=80_000,
            matched_at=datetime(2026, 2, 1, 12, 31, 0),
        )
    )
    await db_session.commit()
    before_count = await _settlement_match_count(db_session)

    response = await async_client.get(
        "/api/v1/analytics/monthly-cashflow",
        params={"start_date": "2026-01-01", "end_date": "2026-02-28"},
    )

    assert response.status_code == 200
    # T055 (audit F03): posting-month attribution; see docs metric reference.
    assert _legacy_shape(response.json()) == {
        "items": [
            {
                "period": "2026-01",
                "income": 0,
                "expense": 180000,
                "transfer": 0,
                "net_cashflow": -180000,
                "savings_rate": None,
            },
            {
                "period": "2026-02",
                "income": 0,
                "expense": -80000,
                "transfer": 0,
                "net_cashflow": 80000,
                "savings_rate": None,
            },
        ]
    }
    assert await _settlement_match_count(db_session) == before_count


async def test_merchant_spend_endpoint_returns_ranked_merchants(
    async_client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    db_session.add_all(
        [
            _transaction(
                tx_date=date(2026, 1, 1),
                tx_time=time(10, 0),
                tx_type="지출",
                category_major="생활",
                category_minor="쇼핑",
                description="쿠팡 주문 1",
                merchant="쿠팡",
                amount=-100,
                payment_method="카드 A",
            ),
            _transaction(
                tx_date=date(2026, 1, 3),
                tx_time=time(9, 0),
                tx_type="지출",
                category_major="생활",
                category_minor="쇼핑",
                description="쿠팡 주문 2",
                merchant="쿠팡",
                amount=20,
                payment_method="카드 A",
            ),
            _transaction(
                tx_date=date(2026, 1, 2),
                tx_time=time(8, 30),
                tx_type="지출",
                category_major="구독",
                category_minor="OTT",
                description="넷플릭스 정기결제",
                merchant="넷플릭스",
                amount=-50,
                payment_method="카드 B",
            ),
        ]
    )
    await db_session.commit()

    response = await async_client.get(
        "/api/v1/analytics/merchant-spend",
        params={
            "start_date": "2026-01-01",
            "end_date": "2026-01-31",
            "type": "지출",
            "limit": 2,
        },
    )

    assert response.status_code == 200
    assert _legacy_shape(response.json()) == {
        "items": [
            {
                "merchant": "쿠팡",
                "amount": 80,
                "count": 2,
                "avg_amount": 40.0,
                "last_seen_at": "2026-01-03T09:00:00",
            },
            {
                "merchant": "넷플릭스",
                "amount": 50,
                "count": 1,
                "avg_amount": 50.0,
                "last_seen_at": "2026-01-02T08:30:00",
            },
        ]
    }


async def test_merchant_spend_endpoint_uses_confirmed_settlement_net_amount(
    async_client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    purchase = _transaction(
        tx_date=date(2026, 1, 1),
        tx_time=time(10, 0),
        tx_type="지출",
        category_major="생활",
        category_minor="쇼핑",
        description="쿠팡 주문 1",
        merchant="쿠팡",
        amount=-100,
        payment_method="카드 A",
    )
    refund = _transaction(
        tx_date=date(2026, 1, 3),
        tx_time=time(9, 0),
        tx_type="지출",
        category_major="생활",
        category_minor="쇼핑",
        description="쿠팡 부분 환불",
        merchant="쿠팡",
        amount=20,
        payment_method="카드 A",
    )
    db_session.add_all(
        [
            purchase,
            refund,
            _transaction(
                tx_date=date(2026, 1, 2),
                tx_time=time(8, 30),
                tx_type="지출",
                category_major="구독",
                category_minor="OTT",
                description="넷플릭스 정기결제",
                merchant="넷플릭스",
                amount=-50,
                payment_method="카드 B",
            ),
        ]
    )
    await db_session.commit()
    db_session.add(
        SettlementMatch(
            original_transaction_id=purchase.id,
            settlement_transaction_id=refund.id,
            status=SettlementMatchStatus.AUTO_CONFIRMED.value,
            matched_amount=20,
            matched_at=datetime(2026, 1, 3, 9, 1, 0),
        )
    )
    await db_session.commit()

    response = await async_client.get(
        "/api/v1/analytics/merchant-spend",
        params={
            "start_date": "2026-01-01",
            "end_date": "2026-01-31",
            "type": "지출",
            "limit": 2,
        },
    )

    assert response.status_code == 200
    assert _legacy_shape(response.json()) == {
        "items": [
            {
                "merchant": "쿠팡",
                # T054: count is distinct transactions (the linked refund
                # counts too); amount is unchanged.
                "amount": 80,
                "count": 2,
                "avg_amount": 40.0,
                "last_seen_at": "2026-01-03T09:00:00",
            },
            {
                "merchant": "넷플릭스",
                "amount": 50,
                "count": 1,
                "avg_amount": 50.0,
                "last_seen_at": "2026-01-02T08:30:00",
            },
        ]
    }


# ── P1: payment-method-patterns ──────────────────────────────────────────────


async def test_payment_method_patterns_endpoint_returns_aggregation(
    async_client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    from datetime import time

    db_session.add_all(
        [
            _transaction(
                tx_date=date(2026, 1, 1),
                tx_time=time(9, 0),
                tx_type="지출",
                category_major="식비",
                category_minor=None,
                description="스타벅스",
                amount=-10000,
                payment_method="카드",
            ),
            _transaction(
                tx_date=date(2026, 1, 2),
                tx_time=time(10, 0),
                tx_type="지출",
                category_major="교통",
                category_minor=None,
                description="지하철",
                amount=-10000,
                payment_method="현금",
            ),
        ]
    )
    await db_session.commit()

    response = await async_client.get(
        "/api/v1/analytics/payment-method-patterns",
        params={"start_date": "2026-01-01", "end_date": "2026-01-31"},
    )

    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert len(data["items"]) == 2
    methods = {item["payment_method"] for item in data["items"]}
    assert methods == {"카드", "현금"}


# ── P1: income-stability ──────────────────────────────────────────────────────


async def test_income_stability_endpoint_returns_stats(
    async_client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    from datetime import time

    db_session.add_all(
        [
            _transaction(
                tx_date=date(2026, 1, 25),
                tx_time=time(9, 0),
                tx_type="수입",
                category_major="급여",
                category_minor=None,
                description="월급",
                amount=3000000,
                payment_method=None,
            ),
            _transaction(
                tx_date=date(2026, 2, 25),
                tx_time=time(9, 0),
                tx_type="수입",
                category_major="급여",
                category_minor=None,
                description="월급",
                amount=3000000,
                payment_method=None,
            ),
        ]
    )
    await db_session.commit()

    response = await async_client.get(
        "/api/v1/analytics/income-stability",
        params={"start_date": "2026-01-01", "end_date": "2026-02-28"},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["avg"] == 3000000
    assert "items" in data
    assert len(data["items"]) == 2
    assert "assumptions" in data


async def test_income_stability_endpoint_defaults_to_last_closed_month(
    async_client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch,
) -> None:
    class FrozenDate(date):
        @classmethod
        def today(cls) -> "FrozenDate":
            return cls(2026, 4, 8)

    monkeypatch.setattr(analytics_service_module, "date", FrozenDate)

    db_session.add_all(
        [
            _transaction(
                tx_date=date(2026, 1, 25),
                tx_time=time(9, 0),
                tx_type="수입",
                category_major="급여",
                category_minor=None,
                description="월급",
                amount=3000000,
                payment_method=None,
            ),
            _transaction(
                tx_date=date(2026, 2, 25),
                tx_time=time(9, 0),
                tx_type="수입",
                category_major="급여",
                category_minor=None,
                description="월급",
                amount=3000000,
                payment_method=None,
            ),
            _transaction(
                tx_date=date(2026, 3, 25),
                tx_time=time(9, 0),
                tx_type="수입",
                category_major="급여",
                category_minor=None,
                description="월급",
                amount=3000000,
                payment_method=None,
            ),
            _transaction(
                tx_date=date(2026, 4, 5),
                tx_time=time(9, 0),
                tx_type="수입",
                category_major="급여",
                category_minor=None,
                description="보너스",
                amount=9000000,
                payment_method=None,
            ),
        ]
    )
    await db_session.commit()

    response = await async_client.get("/api/v1/analytics/income-stability")

    assert response.status_code == 200
    data = response.json()
    assert [item["period"] for item in data["items"]] == [
        "2026-01",
        "2026-02",
        "2026-03",
    ]
    assert data["avg"] == 3000000
    assert data["comparison_mode"] == "closed"
    assert data["reference_date"] == "2026-03-31"
    assert data["is_partial_period"] is False
    assert "직전 마감월 기준" in data["assumptions"]


async def test_income_stability_endpoint_partial_period_uses_same_day_cutoff(
    async_client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    db_session.add_all(
        [
            _transaction(
                tx_date=date(2026, 3, 5),
                tx_time=time(9, 0),
                tx_type="수입",
                category_major="급여",
                category_minor=None,
                description="급여",
                amount=1000000,
                payment_method=None,
            ),
            _transaction(
                tx_date=date(2026, 3, 20),
                tx_time=time(9, 0),
                tx_type="수입",
                category_major="급여",
                category_minor=None,
                description="인센티브",
                amount=9000000,
                payment_method=None,
            ),
            _transaction(
                tx_date=date(2026, 4, 6),
                tx_time=time(9, 0),
                tx_type="수입",
                category_major="급여",
                category_minor=None,
                description="급여",
                amount=1100000,
                payment_method=None,
            ),
        ]
    )
    await db_session.commit()

    response = await async_client.get(
        "/api/v1/analytics/income-stability",
        params={"start_date": "2026-03-01", "end_date": "2026-04-07"},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["items"] == [
        {"period": "2026-03", "income": 1000000},
        {"period": "2026-04", "income": 1100000},
    ]
    assert data["avg"] == 1050000
    assert data["coefficient_of_variation"] == 0.0476
    assert data["comparison_mode"] == "partial"
    assert data["reference_date"] == "2026-04-07"
    assert data["is_partial_period"] is True
    assert "부분 기간 비교" in data["assumptions"]


# ── P1: recurring-payments ────────────────────────────────────────────────────


# ── P1: spending-anomalies ────────────────────────────────────────────────────
