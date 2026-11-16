"""Synthetic regressions for analytics audit; all writes use temporary SQLite."""

from datetime import date, time

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.purchase_gate_review import PurchaseGateReview
from app.models.settlement_group import SettlementMatch
from app.models.transaction import Transaction
from app.schemas.settings import PurchaseGateSettings
from app.services.analytics_service import (
    get_fixed_cost_summary,
    get_fixed_cost_trend,
    get_income_stability,
    get_merchant_spend,
    get_purchase_gate_candidates,
    get_recurring_payments,
    get_spending_anomalies,
)


def _expense(
    day: date,
    amount: int,
    *,
    merchant: str = "상점",
    category: str = "생활",
    cost_kind: str | None = "variable",
    necessity: str | None = "discretionary",
    fixed_necessity: str | None = None,
    payment: str | None = "카드A",
    kind: str | None = None,
    tx_type: str = "지출",
) -> Transaction:
    return Transaction(
        date=day,
        time=time(10),
        type=tx_type,
        category_major=category,
        description=merchant,
        merchant=merchant,
        amount=amount,
        currency="KRW",
        payment_method=payment,
        cost_kind=cost_kind,
        fixed_cost_necessity=fixed_necessity,
        spend_necessity=necessity,
        recurring_payment_kind=kind,
        source="import",
    )


def _purchase_settings() -> PurchaseGateSettings:
    return PurchaseGateSettings(
        large_purchase_threshold=100_000,
        min_candidate_amount=100_000,
        new_merchant_lookback_months=6,
        merchant_spike_ratio=2,
        discretionary_spike_ratio=2,
        review_cooldown_days=3,
        candidate_risk_threshold="warning",
        enabled_candidate_types=["large_oneoff", "new_merchant"],
        excluded_category_names=[],
        excluded_merchants=[],
    )


@pytest.mark.parametrize(
    ("target", "direction", "mode", "reason"),
    [
        (150_000, "decrease", "sparse_baseline_drop", "급감"),
        (-150_000, "increase", "sparse_baseline_spike", "급증"),
    ],
)
async def test_sparse_anomaly_has_signed_direction_and_suppressed_percentage(
    db_session: AsyncSession, target: int, direction: str, mode: str, reason: str
) -> None:
    db_session.add_all(
        [
            _expense(date(2026, 1, 10), -10_000),
            _expense(date(2026, 2, 10), -10_000),
            _expense(date(2026, 3, 10), target),
        ]
    )
    await db_session.flush()
    response = await get_spending_anomalies(
        db_session, end_date=date(2026, 3, 31), baseline_months=2, anomaly_threshold=2
    )
    assert response.total == 1
    item = response.items[0]
    assert item.amount == -target
    assert item.direction == direction
    assert item.anomaly_mode == mode
    assert item.delta_pct_display is None
    assert item.delta_pct_raw == (-target - 10_000) / 10_000 * 100
    assert reason in item.reason
    if target > 0:
        assert "순환급" in item.reason
        assert "급증" not in item.reason


async def test_necessity_buckets_are_exhaustive_separate_from_missing_cost_kind(
    db_session: AsyncSession,
) -> None:
    day = date(2026, 3, 10)
    db_session.add_all(
        [
            _expense(day, -100, cost_kind="fixed", fixed_necessity="essential"),
            _expense(day, -200),
            _expense(day, -300, cost_kind="fixed", fixed_necessity=None),
            _expense(day, 50, cost_kind="fixed", fixed_necessity=None),
            _expense(day, -400, necessity=None),
            _expense(day, -500, cost_kind=None),
        ]
    )
    await db_session.flush()
    summary = await get_fixed_cost_summary(db_session, start_date=None, end_date=None)
    trend = await get_fixed_cost_trend(db_session, start_date=None, end_date=None)
    for result in [summary, trend.items[0]]:
        assert result.expense_total == 1450
        assert result.unclassified_total == 500
        assert result.unclassified_count == 1
        assert result.necessity_unclassified_total == 1150
        assert result.necessity_unclassified_count == 4
        assert (
            result.required_spend_total
            + result.discretionary_spend_total
            + result.necessity_unclassified_total
            == result.expense_total
        )


async def test_recurring_active_filter_excludes_history_and_zero_only_groups_before_paging(
    db_session: AsyncSession,
) -> None:
    db_session.add_all(
        [
            _expense(date(2026, 2, 5), -10_000, merchant="현재 반복"),
            _expense(date(2026, 3, 5), -10_000, merchant="현재 반복"),
            _expense(date(2026, 3, 10), 1_000, merchant="현재 반복"),
            _expense(date(2025, 11, 5), -10_000, merchant="종료 이력"),
            _expense(date(2025, 12, 5), -10_000, merchant="종료 이력"),
            _expense(date(2026, 3, 5), -150_000, merchant="취소 가승인"),
            _expense(date(2026, 3, 5), 150_000, merchant="취소 가승인"),
            _expense(date(2026, 3, 5), -10_000, merchant="불규칙"),
            _expense(date(2026, 3, 6), -10_000, merchant="불규칙"),
        ]
    )
    await db_session.flush()
    response = await get_recurring_payments(
        db_session,
        start_date=None,
        end_date=date(2026, 3, 15),
        min_occurrences=2,
        activity="active",
        per_page=1,
    )
    assert response.total == 1
    assert response.reference_date == date(2026, 3, 15)
    item = response.items[0]
    assert item.merchant == "현재 반복"
    assert item.last_date == date(2026, 3, 10)
    assert item.last_charge_date == date(2026, 3, 5)
    assert item.net_amount == 19_000
    assert item.avg_amount == 9_500
    history = await get_recurring_payments(
        db_session,
        start_date=None,
        end_date=date(2026, 3, 15),
        min_occurrences=2,
        activity="history",
    )
    assert {item.merchant: item.activity_status for item in history.items} == {
        "종료 이력": "historical",
        "취소 가승인": "non_positive",
        "불규칙": "irregular",
    }


async def test_cancellation_marker_is_readonly_conservative_and_preserves_review(
    db_session: AsyncSession,
    sync_legacy_classification,
) -> None:
    day = date(2026, 3, 5)
    charge = _expense(day, -150_000, merchant="주유소")
    refund = _expense(day, 150_000, merchant="주유소", necessity=None)
    actual = _expense(day, -90_000, merchant="주유소")
    db_session.add_all([charge, refund, actual])
    await db_session.flush()
    db_session.add(
        PurchaseGateReview(
            candidate_key=f"transaction:{charge.id}",
            candidate_type="large_oneoff",
            transaction_id=charge.id,
            review_status="snoozed",
            memo="확인 대기",
        )
    )
    await db_session.flush()
    await sync_legacy_classification()
    response = await get_purchase_gate_candidates(
        db_session,
        start_date=date(2026, 3, 1),
        end_date=date(2026, 3, 31),
        settings=_purchase_settings(),
        review_status="snoozed",
    )
    assert response.total == 1
    item = response.items[0]
    assert item.transaction_id == charge.id
    assert item.possible_cancellation
    assert item.cancellation_evidence_transaction_ids == [charge.id, refund.id]
    assert item.amount == 150_000
    assert item.confidence == "low"
    assert item.risk_level == "unknown"
    assert item.future_friction_suggestion is None
    assert item.review_status == "snoozed"
    assert item.review_memo == "확인 대기"
    assert response.start_date == date(2026, 3, 1)
    assert response.end_date == date(2026, 3, 31)
    assert (
        await db_session.scalar(select(func.count()).select_from(SettlementMatch)) == 0
    )
    assert (await db_session.get(Transaction, charge.id)).amount == -150_000


@pytest.mark.parametrize("mismatch", ["date", "payment", "amount", "ambiguous"])
async def test_cancellation_marker_requires_unique_exact_evidence(
    db_session: AsyncSession,
    mismatch: str,
    sync_legacy_classification,
) -> None:
    day = date(2026, 3, 5)
    charge = _expense(day, -150_000)
    refund = _expense(
        date(2026, 3, 6) if mismatch == "date" else day,
        149_000 if mismatch == "amount" else 150_000,
        payment="카드B" if mismatch == "payment" else "카드A",
    )
    db_session.add_all([charge, refund])
    if mismatch == "ambiguous":
        db_session.add(_expense(day, -150_000))
    await db_session.flush()
    await sync_legacy_classification()
    response = await get_purchase_gate_candidates(
        db_session,
        start_date=date(2026, 3, 1),
        end_date=date(2026, 3, 31),
        settings=_purchase_settings(),
    )
    assert response.items
    assert all(not item.possible_cancellation for item in response.items)


async def test_income_stability_states_incomplete_observation_basis(
    db_session: AsyncSession,
) -> None:
    db_session.add(_expense(date(2026, 3, 5), 100, tx_type="수입"))
    await db_session.flush()
    response = await get_income_stability(
        db_session, start_date=date(2026, 1, 15), end_date=date(2026, 3, 10)
    )
    assert response.avg == 100
    assert response.is_partial_period
    assert "수입이 관측된 월만" in response.assumptions
    assert "완전성은 검증하지 않은" in response.assumptions


async def test_income_expense_analytics_excludes_transfers(
    db_session: AsyncSession,
) -> None:
    day = date(2026, 3, 5)
    db_session.add_all(
        [
            _expense(day, -100),
            _expense(day, 30),
            _expense(day, 200, merchant="수입", tx_type="수입"),
            _expense(day, -999, merchant="카드대금", tx_type="이체"),
        ]
    )
    await db_session.flush()
    response = await get_merchant_spend(
        db_session, start_date=None, end_date=None, tx_type="income_expense", limit=100
    )
    assert {item.merchant: item.amount for item in response.items} == {
        "상점": 70,
        "수입": 200,
    }
