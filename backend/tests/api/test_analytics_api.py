from datetime import date, datetime, time

from httpx import AsyncClient
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
    category_major_user: str | None = None,
    category_minor_user: str | None = None,
    cost_kind: str | None = None,
    fixed_cost_necessity: str | None = None,
    is_deleted: bool = False,
    merged_into_id: int | None = None,
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
        cost_kind=cost_kind,
        fixed_cost_necessity=fixed_cost_necessity,
        is_deleted=is_deleted,
        merged_into_id=merged_into_id,
        source="import",
        created_at=now,
        updated_at=now,
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
    assert response.json() == {
        "items": [
            {
                "period": "2026-01",
                "income": 1000,
                "expense": 400,
                "transfer": 200,
                "net_cashflow": 600,
                "savings_rate": 0.6,
            }
        ]
    }


async def test_category_mom_endpoint_returns_latest_month_comparison(
    async_client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    db_session.add_all(
        [
            _transaction(
                tx_date=date(2026, 2, 3),
                tx_time=time(12, 0),
                tx_type="지출",
                category_major="미분류",
                category_minor="미분류",
                category_major_user="식비",
                category_minor_user="배달",
                description="배달앱",
                amount=-300,
                payment_method="카드 A",
            ),
            _transaction(
                tx_date=date(2026, 3, 3),
                tx_time=time(12, 0),
                tx_type="지출",
                category_major="미분류",
                category_minor="미분류",
                category_major_user="식비",
                category_minor_user="배달",
                description="배달앱",
                amount=-450,
                payment_method="카드 A",
            ),
        ]
    )
    await db_session.commit()

    response = await async_client.get(
        "/api/v1/analytics/category-mom",
        params={
            "start_date": "2026-02-01",
            "end_date": "2026-03-31",
            "level": "major",
            "type": "지출",
        },
    )

    assert response.status_code == 200
    assert response.json() == {
        "items": [
            {
                "period": "2026-03",
                "previous_period": "2026-02",
                "category": "식비",
                "current_amount": 450,
                "previous_amount": 300,
                "delta_amount": 150,
                "delta_pct": 0.5,
            }
        ]
    }


async def test_fixed_cost_summary_endpoint_returns_totals_and_unclassified(
    async_client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    db_session.add_all(
        [
            _transaction(
                tx_date=date(2026, 3, 1),
                tx_time=time(8, 0),
                tx_type="지출",
                category_major="주거",
                category_minor="월세",
                description="월세",
                amount=-100,
                payment_method="계좌 A",
                cost_kind="fixed",
                fixed_cost_necessity="essential",
            ),
            _transaction(
                tx_date=date(2026, 3, 2),
                tx_time=time(9, 0),
                tx_type="지출",
                category_major="식비",
                category_minor="장보기",
                description="마트",
                amount=-70,
                payment_method="카드 B",
                cost_kind="variable",
            ),
            _transaction(
                tx_date=date(2026, 3, 3),
                tx_time=time(9, 30),
                tx_type="지출",
                category_major="기타",
                category_minor=None,
                description="미분류",
                amount=-30,
                payment_method="카드 C",
            ),
        ]
    )
    await db_session.commit()

    response = await async_client.get(
        "/api/v1/analytics/fixed-cost-summary",
        params={"start_date": "2026-03-01", "end_date": "2026-03-31"},
    )

    assert response.status_code == 200
    assert response.json() == {
        "expense_total": 200,
        "fixed_total": 100,
        "variable_total": 70,
        "fixed_ratio": 0.5,
        "essential_fixed_total": 100,
        "discretionary_fixed_total": 0,
        "unclassified_total": 30,
        "unclassified_count": 1,
    }


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
    assert response.json() == {
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


# ── P1: payment-method-patterns ──────────────────────────────────────────────

async def test_payment_method_patterns_endpoint_returns_aggregation(
    async_client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    from datetime import time
    db_session.add_all([
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
    ])
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
    db_session.add_all([
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
    ])
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


# ── P1: recurring-payments ────────────────────────────────────────────────────

async def test_recurring_payments_endpoint_detects_monthly(
    async_client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    from datetime import time
    db_session.add_all([
        _transaction(
            tx_date=date(2026, 1, 1),
            tx_time=time(9, 0),
            tx_type="지출",
            category_major="구독",
            category_minor=None,
            description="넷플릭스",
            amount=-15000,
            payment_method="카드",
        ),
        _transaction(
            tx_date=date(2026, 2, 1),
            tx_time=time(9, 0),
            tx_type="지출",
            category_major="구독",
            category_minor=None,
            description="넷플릭스",
            amount=-15000,
            payment_method="카드",
        ),
        _transaction(
            tx_date=date(2026, 3, 1),
            tx_time=time(9, 0),
            tx_type="지출",
            category_major="구독",
            category_minor=None,
            description="넷플릭스",
            amount=-15000,
            payment_method="카드",
        ),
    ])
    await db_session.commit()

    response = await async_client.get(
        "/api/v1/analytics/recurring-payments",
        params={"start_date": "2026-01-01", "end_date": "2026-03-31"},
    )

    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert "assumptions" in data
    assert len(data["items"]) == 1
    assert data["items"][0]["interval_type"] == "monthly"
    assert data["items"][0]["merchant"] == "넷플릭스"
    assert "동일 거래처의 반복 간격" in data["assumptions"]


async def test_recurring_payments_endpoint_paginates_results(
    async_client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    entries: list[Transaction] = []
    for index in range(1, 13):
        merchant = f"구독-{index:02d}"
        entries.extend([
            _transaction(
                tx_date=date(2026, 1, 1),
                tx_time=time(9, 0),
                tx_type="지출",
                category_major="구독",
                category_minor=None,
                description=f"{merchant} 1월",
                merchant=merchant,
                amount=-15000,
                payment_method="카드",
            ),
            _transaction(
                tx_date=date(2026, 2, 1),
                tx_time=time(9, 0),
                tx_type="지출",
                category_major="구독",
                category_minor=None,
                description=f"{merchant} 2월",
                merchant=merchant,
                amount=-15000,
                payment_method="카드",
            ),
        ])
    db_session.add_all(entries)
    await db_session.commit()

    response = await async_client.get(
        "/api/v1/analytics/recurring-payments",
        params={"start_date": "2026-01-01", "end_date": "2026-02-28", "page": 2, "per_page": 10},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 12
    assert data["page"] == 2
    assert data["per_page"] == 10
    assert len(data["items"]) == 2
    assert data["items"][0]["merchant"] == "구독-11"
    assert data["items"][1]["merchant"] == "구독-12"


# ── P1: spending-anomalies ────────────────────────────────────────────────────

async def test_spending_anomalies_endpoint_detects_spike(
    async_client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    from datetime import time
    db_session.add_all([
        _transaction(
            tx_date=date(2026, 1, 15),
            tx_time=time(9, 0),
            tx_type="지출",
            category_major="식비",
            category_minor=None,
            description="식당",
            amount=-100000,
            payment_method=None,
        ),
        _transaction(
            tx_date=date(2026, 2, 15),
            tx_time=time(9, 0),
            tx_type="지출",
            category_major="식비",
            category_minor=None,
            description="식당",
            amount=-100000,
            payment_method=None,
        ),
        _transaction(
            tx_date=date(2026, 3, 15),
            tx_time=time(9, 0),
            tx_type="지출",
            category_major="식비",
            category_minor=None,
            description="식당",
            amount=-200000,
            payment_method=None,
        ),
    ])
    await db_session.commit()

    response = await async_client.get(
        "/api/v1/analytics/spending-anomalies",
        params={"end_date": "2026-03-31", "baseline_months": 2, "anomaly_threshold": 0.5},
    )

    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert "assumptions" in data
    assert len(data["items"]) >= 1
    assert data["items"][0]["category"] == "식비"
    assert "급증" in data["items"][0]["reason"]


async def test_spending_anomalies_endpoint_paginates_results(
    async_client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    entries: list[Transaction] = []
    for index in range(1, 13):
        category = f"카테고리-{index:02d}"
        entries.extend([
            _transaction(
                tx_date=date(2026, 1, 15),
                tx_time=time(9, 0),
                tx_type="지출",
                category_major=category,
                category_minor=None,
                description=f"{category} 1월",
                amount=-100000,
                payment_method=None,
            ),
            _transaction(
                tx_date=date(2026, 2, 15),
                tx_time=time(9, 0),
                tx_type="지출",
                category_major=category,
                category_minor=None,
                description=f"{category} 2월",
                amount=-100000,
                payment_method=None,
            ),
            _transaction(
                tx_date=date(2026, 3, 15),
                tx_time=time(9, 0),
                tx_type="지출",
                category_major=category,
                category_minor=None,
                description=f"{category} 3월",
                amount=-200000,
                payment_method=None,
            ),
        ])
    db_session.add_all(entries)
    await db_session.commit()

    response = await async_client.get(
        "/api/v1/analytics/spending-anomalies",
        params={"end_date": "2026-03-31", "baseline_months": 2, "anomaly_threshold": 0.5, "page": 2, "per_page": 10},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 12
    assert data["page"] == 2
    assert data["per_page"] == 10
    assert len(data["items"]) == 2
    assert data["items"][0]["category"] == "카테고리-11"
    assert data["items"][1]["category"] == "카테고리-12"
