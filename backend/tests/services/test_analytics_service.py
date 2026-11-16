from datetime import date, datetime, time

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.loan_account import LoanAccount
from app.models.loan_transaction_link import LoanTransactionLink
from app.models.purchase_gate_review import PurchaseGateReview
from app.models.settlement_group import SettlementMatch, SettlementMatchStatus
from app.models.transaction import Transaction
from app.schemas.analytics import PurchaseGateReviewPatchRequest
from app.schemas.settings import PurchaseGateSettings
from app.services import analytics_service as analytics_service_module
from app.services.analytics_service import (
    get_purchase_gate_candidates,
    get_income_stability,
    get_merchant_spend,
    get_monthly_cashflow,
    get_payment_method_patterns,
    get_spending_anomalies,
    update_purchase_gate_candidate_review,
)


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

    assert _legacy_shape(response.model_dump()) == {
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
                # T057: data ends mid-February (in-progress month) -> no ratio.
                "savings_rate": None,
            },
        ]
    }


async def test_get_monthly_cashflow_uses_confirmed_settlement_net_amount(
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
    before_count = await _settlement_match_count(db_session)

    response = await get_monthly_cashflow(
        db_session,
        start_date=date(2026, 1, 1),
        end_date=date(2026, 2, 28),
    )

    # T055 (audit F03): a confirmed refund stays in its posting month.
    assert _legacy_shape(response.model_dump()) == {
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
    assert await _settlement_match_count(db_session) == before_count


async def test_get_monthly_cashflow_does_not_create_settlement_matches(
    db_session: AsyncSession,
) -> None:
    db_session.add_all(
        [
            _transaction(
                tx_date=date(2026, 1, 31),
                tx_time=time(10, 0),
                tx_type="지출",
                category_major="생활",
                category_minor="쇼핑",
                description="원결제",
                merchant="상점B",
                amount=-600,
                payment_method="카드 A",
            ),
            _transaction(
                tx_date=date(2026, 2, 1),
                tx_time=time(10, 30),
                tx_type="지출",
                category_major="생활",
                category_minor="쇼핑",
                description="부분 환불",
                merchant="상점B",
                amount=100,
                payment_method="카드 A",
            ),
        ]
    )
    await db_session.commit()

    assert await _settlement_match_count(db_session) == 0

    await get_monthly_cashflow(
        db_session,
        start_date=date(2026, 1, 1),
        end_date=date(2026, 2, 28),
    )

    assert await _settlement_match_count(db_session) == 0


async def test_get_monthly_cashflow_keeps_review_required_refund_on_raw_basis(
    db_session: AsyncSession,
) -> None:
    from app.services.settlement_group_service import reconcile_settlement_matches

    db_session.add_all(
        [
            _transaction(
                tx_date=date(2026, 1, 10),
                tx_time=time(10, 0),
                tx_type="지출",
                category_major="생활",
                category_minor="쇼핑",
                description="의자 구매",
                merchant="상점A",
                amount=-1_000,
                payment_method="카드 A",
            ),
            _transaction(
                tx_date=date(2026, 1, 11),
                tx_time=time(10, 0),
                tx_type="지출",
                category_major="생활",
                category_minor="쇼핑",
                description="의자 재구매",
                merchant="상점A",
                amount=-1_000,
                payment_method="카드 A",
            ),
            _transaction(
                tx_date=date(2026, 1, 12),
                tx_time=time(10, 0),
                tx_type="지출",
                category_major="생활",
                category_minor="쇼핑",
                description="의자 환불",
                merchant="상점A",
                amount=200,
                payment_method="카드 A",
            ),
        ]
    )
    await db_session.commit()
    await reconcile_settlement_matches(db_session)
    before_count = await _settlement_match_count(db_session)

    response = await get_monthly_cashflow(
        db_session,
        start_date=date(2026, 1, 1),
        end_date=date(2026, 1, 31),
    )

    assert _legacy_shape(response.model_dump()) == {
        "items": [
            {
                "period": "2026-01",
                "income": 0,
                "expense": 1800,
                "transfer": 0,
                "net_cashflow": -1800,
                "savings_rate": None,
            }
        ]
    }
    assert await _settlement_match_count(db_session) == before_count


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

    assert _legacy_shape(response.model_dump()) == {
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


async def test_get_merchant_spend_uses_confirmed_settlement_net_amount(
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

    response = await get_merchant_spend(
        db_session,
        start_date=date(2026, 1, 1),
        end_date=date(2026, 1, 31),
        tx_type="지출",
        limit=2,
    )

    assert _legacy_shape(response.model_dump()) == {
        "items": [
            {
                # T054: count is distinct transactions; amount unchanged.
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
    db_session.add_all(
        [
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
        ]
    )
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
    db_session.add_all(
        [
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
        ]
    )
    await db_session.commit()

    response = await get_income_stability(
        db_session,
        start_date=date(2026, 1, 1),
        end_date=date(2026, 2, 28),
    )

    assert response.avg == 2000
    assert response.stdev == 0.0
    assert response.coefficient_of_variation == 0.0
    assert "월별 수입 기준, 이체 제외" in response.assumptions
    assert "수입이 관측된 월만" in response.assumptions
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


async def test_get_income_stability_defaults_to_last_closed_month(
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
                amount=3000,
                payment_method=None,
            ),
            _transaction(
                tx_date=date(2026, 2, 25),
                tx_time=time(9, 0),
                tx_type="수입",
                category_major="급여",
                category_minor=None,
                description="월급",
                amount=3000,
                payment_method=None,
            ),
            _transaction(
                tx_date=date(2026, 3, 25),
                tx_time=time(9, 0),
                tx_type="수입",
                category_major="급여",
                category_minor=None,
                description="월급",
                amount=3000,
                payment_method=None,
            ),
            _transaction(
                tx_date=date(2026, 4, 5),
                tx_time=time(9, 0),
                tx_type="수입",
                category_major="급여",
                category_minor=None,
                description="보너스",
                amount=9000,
                payment_method=None,
            ),
        ]
    )
    await db_session.commit()

    response = await get_income_stability(
        db_session,
        start_date=None,
        end_date=None,
    )

    assert [item.model_dump() for item in response.items] == [
        {"period": "2026-01", "income": 3000},
        {"period": "2026-02", "income": 3000},
        {"period": "2026-03", "income": 3000},
    ]
    assert response.avg == 3000
    assert response.coefficient_of_variation == 0.0
    assert response.comparison_mode == "closed"
    assert response.reference_date == date(2026, 3, 31)
    assert response.is_partial_period is False
    assert "직전 마감월 기준" in response.assumptions


async def test_get_income_stability_partial_period_uses_same_day_baseline_cutoff(
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
                amount=1000,
                payment_method=None,
            ),
            _transaction(
                tx_date=date(2026, 3, 20),
                tx_time=time(9, 0),
                tx_type="수입",
                category_major="급여",
                category_minor=None,
                description="인센티브",
                amount=9000,
                payment_method=None,
            ),
            _transaction(
                tx_date=date(2026, 4, 6),
                tx_time=time(9, 0),
                tx_type="수입",
                category_major="급여",
                category_minor=None,
                description="급여",
                amount=1100,
                payment_method=None,
            ),
        ]
    )
    await db_session.commit()

    response = await get_income_stability(
        db_session,
        start_date=date(2026, 3, 1),
        end_date=date(2026, 4, 7),
    )

    assert [item.model_dump() for item in response.items] == [
        {"period": "2026-03", "income": 1000},
        {"period": "2026-04", "income": 1100},
    ]
    assert response.avg == 1050
    assert response.coefficient_of_variation == 0.0476
    assert response.comparison_mode == "partial"
    assert response.reference_date == date(2026, 4, 7)
    assert response.is_partial_period is True
    assert "부분 기간 비교" in response.assumptions


# ── P1: recurring-payments ────────────────────────────────────────────────────


# ── P1: spending-anomalies ────────────────────────────────────────────────────


async def test_get_spending_anomalies_detects_spike(
    db_session: AsyncSession,
) -> None:
    # baseline: 2026-01, 2026-02 각 100000, target: 2026-03 = 200000
    db_session.add_all(
        [
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
        ]
    )
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
    assert response.page == 1
    assert response.per_page == 10


async def test_get_spending_anomalies_filters_by_threshold(
    db_session: AsyncSession,
) -> None:
    # baseline과 동일한 지출 → anomaly_score = 0
    db_session.add_all(
        [
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
        ]
    )
    await db_session.commit()

    response = await get_spending_anomalies(
        db_session,
        end_date=date(2026, 3, 31),
        baseline_months=2,
        anomaly_threshold=0.5,
    )

    assert response.items == []


async def test_get_spending_anomalies_filters_on_anomaly_score(
    db_session: AsyncSession,
) -> None:
    db_session.add_all(
        [
            _transaction(
                tx_date=date(2026, 1, 1),
                tx_time=time(9, 0),
                tx_type="지출",
                category_major="금융",
                category_minor=None,
                description="카드값",
                amount=-300000,
                payment_method=None,
            ),
            _transaction(
                tx_date=date(2026, 2, 15),
                tx_time=time(9, 0),
                tx_type="지출",
                category_major="금융",
                category_minor=None,
                description="카드값",
                amount=-300120,
                payment_method=None,
            ),
            _transaction(
                tx_date=date(2026, 3, 15),
                tx_time=time(9, 0),
                tx_type="지출",
                category_major="금융",
                category_minor=None,
                description="카드값",
                amount=-350000,
                payment_method=None,
            ),
        ]
    )
    await db_session.commit()

    response = await get_spending_anomalies(
        db_session,
        end_date=date(2026, 3, 31),
        baseline_months=2,
        anomaly_threshold=0.5,
        min_delta_amount=10_000,
    )

    assert len(response.items) == 1
    assert response.items[0].category == "금융"
    assert response.items[0].delta_pct == 16.6433
    assert response.items[0].anomaly_score > 0.5
    assert "anomaly_score" in response.assumptions


async def test_get_spending_anomalies_filters_small_absolute_deltas_by_default(
    db_session: AsyncSession,
) -> None:
    db_session.add_all(
        [
            _transaction(
                tx_date=date(2026, 1, 1),
                tx_time=time(9, 0),
                tx_type="지출",
                category_major="금융",
                category_minor=None,
                description="카드값",
                amount=-300000,
                payment_method=None,
            ),
            _transaction(
                tx_date=date(2026, 2, 15),
                tx_time=time(9, 0),
                tx_type="지출",
                category_major="금융",
                category_minor=None,
                description="카드값",
                amount=-300120,
                payment_method=None,
            ),
            _transaction(
                tx_date=date(2026, 3, 15),
                tx_time=time(9, 0),
                tx_type="지출",
                category_major="금융",
                category_minor=None,
                description="카드값",
                amount=-350000,
                payment_method=None,
            ),
        ]
    )
    await db_session.commit()

    default_response = await get_spending_anomalies(
        db_session,
        end_date=date(2026, 3, 31),
        baseline_months=2,
        anomaly_threshold=0.5,
    )
    relaxed_response = await get_spending_anomalies(
        db_session,
        end_date=date(2026, 3, 31),
        baseline_months=2,
        anomaly_threshold=0.5,
        min_delta_amount=10_000,
    )

    assert default_response.items == []
    assert "min_delta_amount=100000" in default_response.assumptions
    assert len(relaxed_response.items) == 1
    assert relaxed_response.items[0].category == "금융"


async def test_get_spending_anomalies_defaults_to_last_closed_month(
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
            _transaction(
                tx_date=date(2026, 2, 5),
                tx_time=time(9, 0),
                tx_type="지출",
                category_major="금융",
                category_minor=None,
                description="카드값",
                amount=-100000,
                payment_method=None,
            ),
            _transaction(
                tx_date=date(2026, 3, 5),
                tx_time=time(9, 0),
                tx_type="지출",
                category_major="금융",
                category_minor=None,
                description="카드값",
                amount=-100000,
                payment_method=None,
            ),
            _transaction(
                tx_date=date(2026, 4, 7),
                tx_time=time(9, 0),
                tx_type="지출",
                category_major="금융",
                category_minor=None,
                description="카드값",
                amount=-400000,
                payment_method=None,
            ),
        ]
    )
    await db_session.commit()

    response = await get_spending_anomalies(
        db_session,
        end_date=None,
        baseline_months=2,
        anomaly_threshold=0.5,
    )

    assert response.items
    assert response.items[0].period == "2026-03"
    assert {item.category for item in response.items} == {"식비"}
    assert response.comparison_mode == "closed"
    assert response.reference_date == date(2026, 3, 31)
    assert response.is_partial_period is False
    assert "min_delta_amount=100000" in response.assumptions
    assert "직전 마감월 기준" in response.assumptions


async def test_get_spending_anomalies_partial_period_uses_same_day_baseline_cutoff(
    db_session: AsyncSession,
) -> None:
    db_session.add_all(
        [
            _transaction(
                tx_date=date(2026, 3, 5),
                tx_time=time(9, 0),
                tx_type="지출",
                category_major="식비",
                category_minor=None,
                description="식당",
                amount=-100000,
                payment_method=None,
            ),
            _transaction(
                tx_date=date(2026, 3, 20),
                tx_time=time(9, 0),
                tx_type="지출",
                category_major="식비",
                category_minor=None,
                description="회식",
                amount=-900000,
                payment_method=None,
            ),
            _transaction(
                tx_date=date(2026, 4, 6),
                tx_time=time(9, 0),
                tx_type="지출",
                category_major="식비",
                category_minor=None,
                description="점심",
                amount=-110000,
                payment_method=None,
            ),
        ]
    )
    await db_session.commit()

    response = await get_spending_anomalies(
        db_session,
        end_date=date(2026, 4, 7),
        baseline_months=1,
        anomaly_threshold=0.5,
    )

    assert response.items == []
    assert response.comparison_mode == "partial"
    # T057: counted only through the transaction as-of date (2026-04-06).
    assert response.reference_date == date(2026, 4, 6)
    assert response.is_partial_period is True
    assert "부분 기간 비교" in response.assumptions


def _purchase_gate_settings() -> PurchaseGateSettings:
    return PurchaseGateSettings(
        large_purchase_threshold=100_000,
        min_candidate_amount=100_000,
        new_merchant_lookback_months=6,
        merchant_spike_ratio=2.0,
        discretionary_spike_ratio=1.5,
        review_cooldown_days=14,
        candidate_risk_threshold="warning",
        enabled_candidate_types=[
            "large_oneoff",
            "new_merchant",
            "merchant_spike",
            "discretionary_spike",
        ],
        excluded_category_names=[],
        excluded_merchants=[],
    )


async def test_get_purchase_gate_candidates_deduplicates_reasons_and_filters_queue(
    db_session: AsyncSession,
    sync_legacy_classification,
) -> None:
    loan_account = LoanAccount(lender="테스트은행", product_name="신용대출")
    baseline_jan = _transaction(
        tx_date=date(2026, 1, 10),
        tx_time=time(10, 0),
        tx_type="지출",
        category_major="생활",
        category_minor="쇼핑",
        description="평소 쇼핑",
        merchant="반복상점",
        amount=-50_000,
        payment_method="카드",
        cost_kind="variable",
        spend_necessity="discretionary",
    )
    baseline_feb = _transaction(
        tx_date=date(2026, 2, 10),
        tx_time=time(10, 0),
        tx_type="지출",
        category_major="생활",
        category_minor="쇼핑",
        description="평소 쇼핑",
        merchant="반복상점",
        amount=-50_000,
        payment_method="카드",
        cost_kind="variable",
        spend_necessity="discretionary",
    )
    baseline_mar = _transaction(
        tx_date=date(2026, 3, 10),
        tx_time=time(10, 0),
        tx_type="지출",
        category_major="생활",
        category_minor="쇼핑",
        description="평소 쇼핑",
        merchant="반복상점",
        amount=-50_000,
        payment_method="카드",
        cost_kind="variable",
        spend_necessity="discretionary",
    )
    spike_tx = _transaction(
        tx_date=date(2026, 4, 12),
        tx_time=time(11, 0),
        tx_type="지출",
        category_major="생활",
        category_minor="쇼핑",
        description="이번 달 급증",
        merchant="반복상점",
        amount=-150_000,
        payment_method="카드",
        cost_kind="variable",
        spend_necessity="discretionary",
    )
    new_merchant_tx = _transaction(
        tx_date=date(2026, 4, 14),
        tx_time=time(12, 0),
        tx_type="지출",
        category_major="생활",
        category_minor="쇼핑",
        description="새 거래처 큰 지출",
        merchant="새상점",
        amount=-120_000,
        payment_method="카드",
        cost_kind="variable",
        spend_necessity="discretionary",
    )
    fixed_tx = _transaction(
        tx_date=date(2026, 4, 16),
        tx_time=time(13, 0),
        tx_type="지출",
        category_major="주거",
        category_minor="관리비",
        description="고정비 제외",
        merchant="고정비상점",
        amount=-200_000,
        payment_method="카드",
        cost_kind="fixed",
        spend_necessity="discretionary",
    )
    essential_tx = _transaction(
        tx_date=date(2026, 4, 18),
        tx_time=time(14, 0),
        tx_type="지출",
        category_major="식비",
        category_minor="장보기",
        description="필수 지출 제외",
        merchant="필수상점",
        amount=-200_000,
        payment_method="카드",
        cost_kind="variable",
        spend_necessity="essential",
    )
    unclassified_tx = _transaction(
        tx_date=date(2026, 4, 20),
        tx_time=time(15, 0),
        tx_type="지출",
        category_major="취미",
        category_minor="게임",
        description="미분류 필요성 제외",
        merchant="미분류상점",
        amount=-200_000,
        payment_method="카드",
        cost_kind="variable",
        spend_necessity=None,
    )
    linked_tx = _transaction(
        tx_date=date(2026, 4, 22),
        tx_time=time(16, 0),
        tx_type="지출",
        category_major="금융",
        category_minor="대출상환",
        description="대출 연결 제외",
        merchant="대출상점",
        amount=-200_000,
        payment_method="계좌",
        cost_kind="variable",
        spend_necessity="discretionary",
    )
    small_tx = _transaction(
        tx_date=date(2026, 4, 24),
        tx_time=time(17, 0),
        tx_type="지출",
        category_major="생활",
        category_minor="쇼핑",
        description="최소 금액 미만",
        merchant="소액상점",
        amount=-90_000,
        payment_method="카드",
        cost_kind="variable",
        spend_necessity="discretionary",
    )
    db_session.add(loan_account)
    db_session.add_all(
        [
            baseline_jan,
            baseline_feb,
            baseline_mar,
            spike_tx,
            new_merchant_tx,
            fixed_tx,
            essential_tx,
            unclassified_tx,
            linked_tx,
            small_tx,
        ]
    )
    await db_session.flush()
    db_session.add(
        LoanTransactionLink(
            transaction_id=linked_tx.id,
            loan_account_id=loan_account.id,
            repayment_type="principal",
            source="manual",
        )
    )
    await db_session.commit()
    await sync_legacy_classification()

    db_session.add(
        PurchaseGateReview(
            candidate_key=f"large_oneoff:{new_merchant_tx.id}",
            candidate_type="large_oneoff",
            transaction_id=new_merchant_tx.id,
            review_status="ignored",
        )
    )
    await db_session.commit()

    response = await get_purchase_gate_candidates(
        db_session,
        start_date=date(2026, 4, 1),
        end_date=date(2026, 4, 30),
        settings=_purchase_gate_settings(),
    )

    assert response.total == 2
    assert [item.transaction_id for item in response.items] == [
        spike_tx.id,
        new_merchant_tx.id,
    ]

    spike_item = response.items[0]
    assert spike_item.candidate_key == f"transaction:{spike_tx.id}"
    assert spike_item.candidate_type == "large_oneoff"
    assert spike_item.candidate_types == [
        "large_oneoff",
        "merchant_spike",
        "discretionary_spike",
    ]
    assert spike_item.review_status == "pending"
    assert spike_item.signals["large_oneoff_threshold"] == 100_000
    assert spike_item.signals["merchant_spike_baseline_avg"] == 50_000
    assert spike_item.signals["merchant_spike_current_total"] == 150_000
    assert spike_item.signals["merchant_spike_ratio"] == 3.0
    assert spike_item.signals["discretionary_spike_current_total"] == 360_000
    assert len(spike_item.reasons) == 3

    new_merchant_item = response.items[1]
    assert new_merchant_item.candidate_key == f"transaction:{new_merchant_tx.id}"
    assert new_merchant_item.candidate_type == "large_oneoff"
    assert new_merchant_item.candidate_types == [
        "large_oneoff",
        "new_merchant",
        "discretionary_spike",
    ]
    assert new_merchant_item.review_status == "ignored"
    assert new_merchant_item.signals["new_merchant_lookback_months"] == 6
    assert len(new_merchant_item.reasons) == 3


async def test_update_purchase_gate_candidate_review_writes_canonical_key(
    db_session: AsyncSession,
) -> None:
    response = await update_purchase_gate_candidate_review(
        db_session,
        candidate_key="large_oneoff:42",
        payload=PurchaseGateReviewPatchRequest(review_status="reviewed"),
    )

    assert response.candidate_key == "transaction:42"
    assert response.candidate_type == "large_oneoff"
    assert response.transaction_id == 42
    assert response.review_status == "reviewed"

    stored = await db_session.get(PurchaseGateReview, 1)
    assert stored is not None
    assert stored.candidate_key == "transaction:42"
    assert stored.candidate_type == "large_oneoff"


async def test_update_purchase_gate_candidate_review_stores_memo_and_cooldown(
    db_session: AsyncSession,
) -> None:
    response = await update_purchase_gate_candidate_review(
        db_session,
        candidate_key="transaction:42",
        payload=PurchaseGateReviewPatchRequest(
            review_status="snoozed",
            memo="다음 급여일 이후 재검토",
            cooldown_days=10,
        ),
    )

    assert response.review_status == "snoozed"
    assert response.memo == "다음 급여일 이후 재검토"
    assert response.reviewed_at is not None
    assert response.cooldown_until is not None
    assert (response.cooldown_until - response.reviewed_at).days == 10


async def test_update_purchase_gate_candidate_review_rejects_invalid_candidate_key(
    db_session: AsyncSession,
) -> None:
    with pytest.raises(analytics_service_module.HTTPException) as exc_info:
        await update_purchase_gate_candidate_review(
            db_session,
            candidate_key="transaction:not-a-number",
            payload=PurchaseGateReviewPatchRequest(review_status="reviewed"),
        )

    assert exc_info.value.status_code == 422


async def test_update_purchase_gate_candidate_review_rolls_back_on_commit_error(
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    rollback_called = False

    async def failing_commit() -> None:
        raise RuntimeError("commit failed")

    async def tracking_rollback() -> None:
        nonlocal rollback_called
        rollback_called = True

    monkeypatch.setattr(db_session, "commit", failing_commit)
    monkeypatch.setattr(db_session, "rollback", tracking_rollback)

    with pytest.raises(RuntimeError, match="commit failed"):
        await update_purchase_gate_candidate_review(
            db_session,
            candidate_key="transaction:99",
            payload=PurchaseGateReviewPatchRequest(review_status="ignored"),
        )

    assert rollback_called is True
