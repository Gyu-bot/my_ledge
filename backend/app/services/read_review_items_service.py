"""Post-hoc review list for the agent read surface (T060, plan 3.3).

One list that unifies the purchase-level review candidates (served today as
``purchase-gate-candidates`` and its alias ``spending-review-candidates``) and
the category spending anomalies. Every item states which detector listed it
and why, using the detectors' own codes, sentences, and thresholds. No new
score is computed; risk/priority/confidence labels and friction suggestions
of the old candidates are not carried over (they read as advice).
"""

import calendar
from datetime import date

from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.analytics import PurchaseGateCandidateItem, SpendingAnomalyItem
from app.schemas.metrics import MONTH_DATA_COVERAGE_RULE
from app.schemas.read_surface import (
    REVIEW_REASON_LABELS,
    REVIEW_SOURCE_LABELS,
    REVIEW_SUBJECT_LABELS,
    STATUS_LABELS,
    ReadBasis,
    ReadPeriodScope,
    ReadReviewItemsData,
    ReadReviewItemsResponse,
    ReviewItem,
    ReviewListedBecause,
)
from app.services.analytics_service import (
    get_purchase_gate_candidates,
    get_spending_anomalies,
)
from app.services.metrics_service import load_as_of
from app.services.read_commitments_service import default_period
from app.services.read_surface_service import (
    build_period_scope,
    common_labels,
    load_period_summaries,
    read_as_of,
    resolve_status,
    scope_classification,
)
from app.services.transaction_axes_service import load_transaction_axes
from app.services.settings_service import (
    get_analytics_settings,
    resolve_spending_anomalies_settings,
)

ALL_ITEMS = 100_000


def _scalar_signals(values: dict[str, object]) -> dict[str, int | float | str | bool]:
    return {
        key: value
        for key, value in values.items()
        if isinstance(value, (int, float, str, bool))
    }


def _purchase_item(candidate: PurchaseGateCandidateItem) -> ReviewItem:
    listed: list[ReviewListedBecause] = []
    aligned = len(candidate.reasons) == len(candidate.candidate_types)
    for index, code in enumerate(candidate.candidate_types):
        listed.append(
            ReviewListedBecause(
                source="purchase_review_candidate",
                source_label=REVIEW_SOURCE_LABELS["purchase_review_candidate"],
                code=code,
                code_label=REVIEW_REASON_LABELS.get(code, code),
                detail=candidate.reasons[index] if aligned else None,
                signals=_scalar_signals(candidate.signals),
            )
        )
    if candidate.possible_cancellation:
        listed.append(
            ReviewListedBecause(
                source="purchase_review_candidate",
                source_label=REVIEW_SOURCE_LABELS["purchase_review_candidate"],
                code="possible_cancellation",
                code_label=REVIEW_REASON_LABELS["possible_cancellation"],
                detail=candidate.reasons[0] if candidate.reasons else None,
                signals={
                    "cancellation_evidence_transaction_ids": ",".join(
                        str(value)
                        for value in candidate.cancellation_evidence_transaction_ids
                    )
                },
            )
        )
    return ReviewItem(
        subject="transaction",
        subject_label=REVIEW_SUBJECT_LABELS["transaction"],
        period=candidate.date.strftime("%Y-%m"),
        date=candidate.date,
        transaction_id=candidate.transaction_id,
        category=candidate.category,
        merchant=candidate.merchant,
        amount=candidate.amount,
        review_status=candidate.review_status,
        listed_because=listed,
    )


def _anomaly_item(
    anomaly: SpendingAnomalyItem, *, threshold: float, min_delta: int
) -> ReviewItem:
    code = (
        "category_increase" if anomaly.direction == "increase" else "category_decrease"
    )
    return ReviewItem(
        subject="category_month",
        subject_label=REVIEW_SUBJECT_LABELS["category_month"],
        period=anomaly.period,
        category=anomaly.category,
        amount=anomaly.amount,
        baseline_amount=anomaly.baseline_avg,
        change_amount=anomaly.amount - anomaly.baseline_avg,
        listed_because=[
            ReviewListedBecause(
                source="spending_anomaly",
                source_label=REVIEW_SOURCE_LABELS["spending_anomaly"],
                code=code,
                code_label=REVIEW_REASON_LABELS[code],
                detail=anomaly.reason,
                signals={
                    "anomaly_score": anomaly.anomaly_score,
                    "anomaly_threshold": threshold,
                    "min_delta_amount": min_delta,
                    "baseline_quality": anomaly.baseline_quality,
                    **(
                        {"delta_pct": anomaly.delta_pct}
                        if anomaly.delta_pct is not None
                        else {}
                    ),
                },
            )
        ],
    )


async def read_review_items(
    db_session: AsyncSession, *, period: str | None, limit: int
) -> ReadReviewItemsResponse:
    as_of = await load_as_of(db_session)
    target = period or default_period(as_of)
    summaries = await load_period_summaries(db_session)
    scope = (
        build_period_scope(
            as_of=as_of, summaries=summaries, start_period=target, end_period=target
        )
        if target is not None
        else ReadPeriodScope(start_period=None, end_period=None, periods=[])
    )
    period_state = scope.periods[0] if scope.periods else None
    items: list[ReviewItem] = []
    comparison = None
    start_date = end_date = None
    if (
        target is not None
        and period_state is not None
        and period_state.coverage == "imported"
        and period_state.transaction_count > 0
        and as_of.transaction_as_of is not None
    ):
        start_date = date.fromisoformat(f"{target}-01")
        month_end = start_date.replace(
            day=calendar.monthrange(start_date.year, start_date.month)[1]
        )
        end_date = min(month_end, as_of.transaction_as_of)
        settings = await get_analytics_settings(db_session)
        candidates = await get_purchase_gate_candidates(
            db_session,
            start_date=start_date,
            end_date=end_date,
            settings=settings.effective.purchase_gate,
            per_page=ALL_ITEMS,
        )
        anomaly_settings = await resolve_spending_anomalies_settings(
            db_session,
            baseline_months=None,
            anomaly_threshold=None,
            min_delta_amount=None,
        )
        anomalies = await get_spending_anomalies(
            db_session,
            end_date=end_date,
            baseline_months=anomaly_settings.baseline_months,
            anomaly_threshold=anomaly_settings.anomaly_threshold,
            min_delta_amount=anomaly_settings.min_delta_amount,
            per_page=ALL_ITEMS,
        )
        comparison = anomalies.comparison
        transaction_items = sorted(
            (_purchase_item(candidate) for candidate in candidates.items),
            key=lambda item: (-item.amount, item.transaction_id or 0),
        )
        category_items = sorted(
            (
                _anomaly_item(
                    anomaly,
                    threshold=anomaly_settings.anomaly_threshold,
                    min_delta=anomaly_settings.min_delta_amount,
                )
                for anomaly in anomalies.items
            ),
            key=lambda item: (-abs(item.change_amount or 0), item.category),
        )
        axes = await load_transaction_axes(
            db_session,
            [item.transaction_id for item in transaction_items if item.transaction_id],
        )
        transaction_items = [
            item.model_copy(update={"axes": axes.get(item.transaction_id or 0)})
            for item in transaction_items
        ]
        items = [*transaction_items, *category_items]
    classification = scope_classification(scope) if scope.periods else None
    state, reasons = resolve_status(
        as_of=as_of, scope=scope, classification=classification
    )
    return ReadReviewItemsResponse(
        surface="review_items",
        surface_label="사후 검토할 거래",
        questions=["Q2", "Q3"],
        status=state,
        status_label=STATUS_LABELS[state],
        status_reasons=reasons,
        as_of=read_as_of(as_of),
        period_scope=scope,
        classification=classification,
        basis=ReadBasis(
            definition="review_items.v1",
            scope=(
                "사후 검토 목록: 선택한 달의 구매 단위 검토 후보와 카테고리 지출 변화를 "
                "한 목록으로. 각 항목은 어느 검출기가 왜 올렸는지를 밝힌다."
            ),
            rules={
                "month_data_coverage": MONTH_DATA_COVERAGE_RULE,
                "sources": (
                    "purchase_review_candidate: 기존 구매 단위 후보 검출기(큰 일회성 지출, "
                    "처음 등장한 거래처, 거래처·카테고리 급증) 그대로. "
                    "spending_anomaly: 기존 카테고리 지출 변화 검출기(비교 계약 기준값) 그대로."
                ),
                "ordering": (
                    "거래 항목을 먼저 금액이 큰 순으로, 그다음 카테고리·월 항목을 기준값 대비 "
                    "금액 차이의 절댓값 순으로 둔다. 새 점수로 정렬하지 않는다."
                ),
                "dropped_fields": (
                    "기존 후보의 risk_level, review_priority, confidence, "
                    "future_friction_suggestion은 조언으로 읽힐 수 있어 싣지 않는다."
                ),
            },
            assumptions=[
                "목록은 이미 일어난 거래의 사후 검토용이다. 구매 전 판단이 아니다.",
                "구매 단위 후보 검출기는 지급 형태가 수시이고 조정 가능성이 "
                "'조정 가능'인 거래만 본다(vw_transaction_nature). 조정 가능성이 "
                "미정인 거래는 후보에 들어가지 않는다.",
                "검출기 설정값(임계값, 기준 개월 수)은 분석 설정의 현재 값이다.",
            ],
        ),
        labels={
            **common_labels(),
            **{f"review_source.{k}": v for k, v in REVIEW_SOURCE_LABELS.items()},
            **{f"review_subject.{k}": v for k, v in REVIEW_SUBJECT_LABELS.items()},
            **{f"review_reason.{k}": v for k, v in REVIEW_REASON_LABELS.items()},
        },
        data=ReadReviewItemsData(
            period=target,
            start_date=start_date,
            end_date=end_date,
            total=len(items),
            truncated=len(items) > limit,
            items=items[:limit],
            comparison=comparison,
        ),
    )
