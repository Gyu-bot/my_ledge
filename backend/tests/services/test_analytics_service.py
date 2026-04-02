from datetime import date, datetime, time

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.transaction import Transaction
from app.services.analytics_service import (
    get_category_mom,
    get_fixed_cost_summary,
    get_income_stability,
    get_merchant_spend,
    get_monthly_cashflow,
    get_payment_method_patterns,
    get_recurring_payments,
    get_spending_anomalies,
)


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


async def test_get_monthly_cashflow_groups_income_expense_and_transfer(
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
            _transaction(
                tx_date=date(2026, 2, 5),
                tx_time=time(9, 0),
                tx_type="수입",
                category_major="급여",
                category_minor=None,
                description="월급",
                amount=1500,
                payment_method="계좌 A",
            ),
            _transaction(
                tx_date=date(2026, 2, 6),
                tx_time=time(10, 0),
                tx_type="지출",
                category_major="식비",
                category_minor="외식",
                description="저녁",
                amount=-600,
                payment_method="카드 A",
            ),
            _transaction(
                tx_date=date(2026, 2, 7),
                tx_time=time(10, 30),
                tx_type="지출",
                category_major="식비",
                category_minor="외식",
                description="저녁 취소",
                amount=100,
                payment_method="카드 A",
            ),
            _transaction(
                tx_date=date(2026, 2, 8),
                tx_time=time(11, 0),
                tx_type="이체",
                category_major="저축",
                category_minor=None,
                description="적금",
                amount=-300,
                payment_method="계좌 A",
            ),
            _transaction(
                tx_date=date(2026, 2, 9),
                tx_time=time(12, 0),
                tx_type="지출",
                category_major="기타",
                category_minor=None,
                description="삭제 거래",
                amount=-999,
                payment_method="카드 B",
                is_deleted=True,
            ),
        ]
    )
    await db_session.commit()

    response = await get_monthly_cashflow(
        db_session,
        start_date=date(2026, 1, 1),
        end_date=date(2026, 2, 28),
    )

    assert response.model_dump() == {
        "items": [
            {
                "period": "2026-01",
                "income": 1000,
                "expense": 400,
                "transfer": 200,
                "net_cashflow": 600,
                "savings_rate": 0.6,
            },
            {
                "period": "2026-02",
                "income": 1500,
                "expense": 500,
                "transfer": 300,
                "net_cashflow": 1000,
                "savings_rate": 0.6667,
            },
        ]
    }


async def test_get_category_mom_uses_effective_categories_and_previous_month_baseline(
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
                tx_date=date(2026, 2, 4),
                tx_time=time(12, 30),
                tx_type="지출",
                category_major="교통",
                category_minor="택시",
                description="택시",
                amount=-100,
                payment_method="카드 B",
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
            _transaction(
                tx_date=date(2026, 3, 4),
                tx_time=time(12, 30),
                tx_type="지출",
                category_major="교통",
                category_minor="택시",
                description="택시",
                amount=-250,
                payment_method="카드 B",
            ),
            _transaction(
                tx_date=date(2026, 3, 5),
                tx_time=time(13, 0),
                tx_type="지출",
                category_major="교통",
                category_minor="택시",
                description="택시 취소",
                amount=20,
                payment_method="카드 B",
            ),
            _transaction(
                tx_date=date(2026, 3, 6),
                tx_time=time(13, 30),
                tx_type="지출",
                category_major="취미",
                category_minor="영화",
                description="영화관",
                amount=-80,
                payment_method="카드 C",
            ),
        ]
    )
    await db_session.commit()

    response = await get_category_mom(
        db_session,
        start_date=date(2026, 2, 1),
        end_date=date(2026, 3, 31),
        level="major",
        tx_type="지출",
    )

    assert response.model_dump() == {
        "items": [
            {
                "period": "2026-03",
                "previous_period": "2026-02",
                "category": "식비",
                "current_amount": 450,
                "previous_amount": 300,
                "delta_amount": 150,
                "delta_pct": 0.5,
            },
            {
                "period": "2026-03",
                "previous_period": "2026-02",
                "category": "교통",
                "current_amount": 230,
                "previous_amount": 100,
                "delta_amount": 130,
                "delta_pct": 1.3,
            },
            {
                "period": "2026-03",
                "previous_period": "2026-02",
                "category": "취미",
                "current_amount": 80,
                "previous_amount": 0,
                "delta_amount": 80,
                "delta_pct": None,
            },
        ]
    }


async def test_get_fixed_cost_summary_reports_fixed_variable_and_unclassified_totals(
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
                tx_time=time(8, 30),
                tx_type="지출",
                category_major="구독",
                category_minor="OTT",
                description="OTT",
                amount=-50,
                payment_method="카드 A",
                cost_kind="fixed",
                fixed_cost_necessity="discretionary",
            ),
            _transaction(
                tx_date=date(2026, 3, 3),
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
                tx_date=date(2026, 3, 4),
                tx_time=time(9, 30),
                tx_type="지출",
                category_major="기타",
                category_minor=None,
                description="미분류",
                amount=-30,
                payment_method="카드 C",
            ),
            _transaction(
                tx_date=date(2026, 3, 5),
                tx_time=time(10, 0),
                tx_type="수입",
                category_major="급여",
                category_minor=None,
                description="월급",
                amount=500,
                payment_method="계좌 A",
            ),
            _transaction(
                tx_date=date(2026, 3, 6),
                tx_time=time(10, 30),
                tx_type="지출",
                category_major="주거",
                category_minor="월세",
                description="삭제 월세",
                amount=-999,
                payment_method="계좌 A",
                cost_kind="fixed",
                fixed_cost_necessity="essential",
                is_deleted=True,
            ),
        ]
    )
    await db_session.commit()

    response = await get_fixed_cost_summary(
        db_session,
        start_date=date(2026, 3, 1),
        end_date=date(2026, 3, 31),
    )

    assert response.model_dump() == {
        "expense_total": 250,
        "fixed_total": 150,
        "variable_total": 70,
        "fixed_ratio": 0.6,
        "essential_fixed_total": 100,
        "discretionary_fixed_total": 50,
        "unclassified_total": 30,
        "unclassified_count": 1,
    }


async def test_get_merchant_spend_groups_by_merchant_and_limits_results(
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
            _transaction(
                tx_date=date(2026, 1, 3),
                tx_time=time(9, 0),
                tx_type="지출",
                category_major="생활",
                category_minor="쇼핑",
                description="쿠팡 주문취소",
                merchant="쿠팡",
                amount=20,
                payment_method="카드 A",
            ),
            _transaction(
                tx_date=date(2026, 1, 4),
                tx_time=time(11, 0),
                tx_type="지출",
                category_major="생활",
                category_minor="쇼핑",
                description="삭제 쿠팡",
                merchant="쿠팡",
                amount=-999,
                payment_method="카드 A",
                is_deleted=True,
            ),
        ]
    )
    await db_session.commit()

    response = await get_merchant_spend(
        db_session,
        start_date=date(2026, 1, 1),
        end_date=date(2026, 1, 31),
        tx_type="지출",
        limit=2,
    )

    assert response.model_dump() == {
        "items": [
            {
                "merchant": "쿠팡",
                "amount": 80,
                "count": 2,
                "avg_amount": 40.0,
                "last_seen_at": datetime(2026, 1, 3, 9, 0),
            },
            {
                "merchant": "넷플릭스",
                "amount": 50,
                "count": 1,
                "avg_amount": 50.0,
                "last_seen_at": datetime(2026, 1, 2, 8, 30),
            },
        ]
    }


# ── P1: payment-method-patterns ──────────────────────────────────────────────

async def test_get_payment_method_patterns_aggregates_by_method(
    db_session: AsyncSession,
) -> None:
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

    response = await get_payment_method_patterns(
        db_session,
        start_date=date(2026, 1, 1),
        end_date=date(2026, 1, 31),
        tx_type="지출",
    )

    assert len(response.items) == 2
    methods = {item.payment_method for item in response.items}
    assert methods == {"카드", "현금"}
    for item in response.items:
        assert item.total_amount == 10000
        assert item.transaction_count == 1
        assert item.avg_amount == 10000
        assert item.pct_of_total == 50.0


async def test_get_payment_method_patterns_none_becomes_unknown(
    db_session: AsyncSession,
) -> None:
    db_session.add_all([
        _transaction(
            tx_date=date(2026, 1, 1),
            tx_time=time(9, 0),
            tx_type="지출",
            category_major="식비",
            category_minor=None,
            description="편의점",
            amount=-5000,
            payment_method=None,
        ),
    ])
    await db_session.commit()

    response = await get_payment_method_patterns(
        db_session,
        start_date=date(2026, 1, 1),
        end_date=date(2026, 1, 31),
        tx_type="지출",
    )

    assert len(response.items) == 1
    assert response.items[0].payment_method == "알 수 없음"


# ── P1: income-stability ──────────────────────────────────────────────────────

async def test_get_income_stability_returns_monthly_series_and_stats(
    db_session: AsyncSession,
) -> None:
    db_session.add_all([
        _transaction(
            tx_date=date(2026, 1, 25),
            tx_time=time(9, 0),
            tx_type="수입",
            category_major="급여",
            category_minor=None,
            description="월급",
            amount=2000,
            payment_method=None,
        ),
        _transaction(
            tx_date=date(2026, 2, 25),
            tx_time=time(9, 0),
            tx_type="수입",
            category_major="급여",
            category_minor=None,
            description="월급",
            amount=2000,
            payment_method=None,
        ),
    ])
    await db_session.commit()

    response = await get_income_stability(
        db_session,
        start_date=date(2026, 1, 1),
        end_date=date(2026, 2, 28),
    )

    assert response.avg == 2000
    assert response.stdev == 0.0
    assert response.coefficient_of_variation == 0.0
    assert response.assumptions == "월별 수입 기준, 이체 제외"
    assert [item.model_dump() for item in response.items] == [
        {"period": "2026-01", "income": 2000},
        {"period": "2026-02", "income": 2000},
    ]


async def test_get_income_stability_empty_returns_defaults(
    db_session: AsyncSession,
) -> None:
    response = await get_income_stability(
        db_session,
        start_date=date(2026, 1, 1),
        end_date=date(2026, 1, 31),
    )

    assert response.avg == 0
    assert response.stdev is None
    assert response.coefficient_of_variation is None
    assert response.items == []


# ── P1: recurring-payments ────────────────────────────────────────────────────

async def test_get_recurring_payments_detects_monthly(
    db_session: AsyncSession,
) -> None:
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

    response = await get_recurring_payments(
        db_session,
        start_date=date(2026, 1, 1),
        end_date=date(2026, 3, 31),
        min_occurrences=2,
    )

    assert len(response.items) == 1
    item = response.items[0]
    assert item.description == "넷플릭스"
    assert item.interval_type == "monthly"
    assert item.occurrences == 3
    assert item.avg_amount == 15000
    assert item.last_date == date(2026, 3, 1)
    assert 0.0 <= item.confidence <= 1.0


async def test_get_recurring_payments_filters_by_min_occurrences(
    db_session: AsyncSession,
) -> None:
    db_session.add_all([
        _transaction(
            tx_date=date(2026, 1, 1),
            tx_time=time(9, 0),
            tx_type="지출",
            category_major="식비",
            category_minor=None,
            description="일회성결제",
            amount=-5000,
            payment_method=None,
        ),
    ])
    await db_session.commit()

    response = await get_recurring_payments(
        db_session,
        start_date=date(2026, 1, 1),
        end_date=date(2026, 3, 31),
        min_occurrences=2,
    )

    assert response.items == []


# ── P1: spending-anomalies ────────────────────────────────────────────────────

async def test_get_spending_anomalies_detects_spike(
    db_session: AsyncSession,
) -> None:
    # baseline: 2026-01, 2026-02 각 100000, target: 2026-03 = 200000
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

    response = await get_spending_anomalies(
        db_session,
        end_date=date(2026, 3, 31),
        baseline_months=2,
        anomaly_threshold=0.5,
    )

    assert len(response.items) == 1
    item = response.items[0]
    assert item.period == "2026-03"
    assert item.category == "식비"
    assert item.amount == 200000
    assert item.baseline_avg == 100000
    assert item.anomaly_score >= 0.5
    assert "급증" in item.reason


async def test_get_spending_anomalies_filters_by_threshold(
    db_session: AsyncSession,
) -> None:
    # baseline과 동일한 지출 → anomaly_score = 0
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
            amount=-100000,
            payment_method=None,
        ),
    ])
    await db_session.commit()

    response = await get_spending_anomalies(
        db_session,
        end_date=date(2026, 3, 31),
        baseline_months=2,
        anomaly_threshold=0.5,
    )

    assert response.items == []
