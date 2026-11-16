"""Agent read surface contracts (T060, Implentation-plan.md 3.2).

Every response of the read surface (``/api/v1/read/*``) shares one envelope:
the surface name, the status vocabulary below, per-kind as-of dates, the
period coverage of the request, classification completeness, and one basis
block (definition, scope, rules, assumptions). Payloads that the screens
already use (monthly flow, spend cube, comparison) are carried unchanged in
``data`` except their ``contract`` block, which becomes the envelope.

Format rules (docs/agents/read-surface-migration.md, docs/backend-api-ssot.md):

- amounts are integers in KRW won; shares/rates are floats in [0, 1] (4 dp).
- dates are ISO ``YYYY-MM-DD``; periods are ``YYYY-MM``.
- stable English keys; every enumerated value has a Korean label, either as a
  sibling ``*_label`` field (new item models) or in the envelope ``labels``.
- assumptions are a list of Korean sentences in ``basis.assumptions``.
"""

import datetime as dt
from datetime import date
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.comparison import (
    ComparisonBasis,
    ComparisonMeasure,
    ComparisonRatio,
    ContributionItem,
    TwelveMonthWindowBasis,
)
from app.schemas.metrics import (
    ExcludedCurrencyItem,
    MonthlyFlowMonth,
    MonthStatus,
    SnapshotAsOf,
    SpendCubeDimension,
    SpendCubeRow,
)

READ_SURFACE_VERSION = "read_surface.v1"

ReadStatus = Literal[
    "ok",
    "classification_incomplete",
    "no_transactions",
    "not_imported",
    "query_failed",
]
STATUS_LABELS: dict[str, str] = {
    "ok": "정상",
    "classification_incomplete": "분류가 덜 되어 계산이 불완전함",
    "no_transactions": "가져온 기간이지만 거래 0건",
    "not_imported": "아직 가져오지 않은 기간",
    "query_failed": "조회 실패",
    "auth_failed": "인증 실패 (HTTP 401)",
}
PeriodCoverage = Literal["imported", "not_imported"]
COVERAGE_LABELS: dict[str, str] = {
    "imported": "가져온 기간",
    "not_imported": "아직 가져오지 않은 기간",
}
QuestionKey = Literal["Q1", "Q2", "Q3", "Q4", "Q5", "Q6"]
QUESTION_LABELS: dict[str, str] = {
    "Q1": "지난 달들에 돈이 어디로 갔나",
    "Q2": "무엇이 변했고, 변화에 얼마씩 기여했나",
    "Q3": "조정할 수 있는 지출은 얼마이고 어디에 있나",
    "Q4": "매달 묶여 있는 지급은 얼마이고 언제 끝나나",
    "Q5": "남은 돈은 어디로 갔고 순자산은 왜 변했나",
    "Q6": "이 숫자는 언제까지의 자료이고, 분류는 얼마나 되어 있나",
}
StatusReasonCode = Literal[
    "no_transactions_imported",
    "periods_not_imported",
    "periods_without_transactions",
    "in_progress_month_included",
    "adjustability_undecided",
    "commitment_attributes_missing",
    "non_krw_excluded",
]
STATUS_REASON_LABELS: dict[str, str] = {
    "no_transactions_imported": "가져온 거래가 아직 없음",
    "periods_not_imported": "요청 기간 일부를 아직 가져오지 않음",
    "periods_without_transactions": "가져온 기간 중 거래가 0건인 달이 있음",
    "in_progress_month_included": "진행월(부분 기록)이 포함됨",
    "adjustability_undecided": "조정 가능성이 미정인 지출이 있음",
    "commitment_attributes_missing": "주기나 조정 가능성이 기록되지 않은 약정이 있음",
    "non_krw_excluded": "원화 외 통화 거래는 합계에서 제외됨",
}
MONTH_STATUS_LABELS: dict[str, str] = {
    "closed": "마감월",
    "in_progress": "진행월(부분 기록)",
}
SNAPSHOT_KIND_LABELS: dict[str, str] = {
    "assets": "자산 스냅샷",
    "loans": "대출 스냅샷",
    "investments": "투자 스냅샷",
    "insurance": "보험 스냅샷",
    "profile": "프로필 스냅샷",
}
ADJUSTABILITY_LABELS: dict[str, str] = {
    "protected": "보호",
    "adjustable": "조정 가능",
    "undecided": "미정",
    "not_applicable": "해당 없음",
}
PAYMENT_FORM_LABELS: dict[str, str] = {
    "committed": "약정",
    "ad_hoc": "수시",
    "not_applicable": "해당 없음",
}
COMMITMENT_KIND_LABELS: dict[str, str] = {
    "loan": "대출",
    "installment": "할부",
    "recurring": "정기 지급",
}
FLOW_SECTION_LABELS: dict[str, str] = {
    "income": "수입",
    "committed": "약정 지급",
    "ad_hoc": "수시 지출",
    "undecided": "미정",
    "transfer": "잔여의 행방(이체)",
    "other": "기타 유형",
}
# Values the spend cube (expense lines only) can hold per filter dimension.
# Anything else is rejected with HTTP 422 instead of returning zero rows.
SpendCubePaymentForm = Literal["committed", "ad_hoc"]
SpendCubeCommitmentKind = Literal["loan", "installment", "recurring"]
SpendCubeAdjustability = Literal["protected", "adjustable", "undecided"]
SpendCubeFlowRow = Literal[
    "committed_loan",
    "committed_installment",
    "committed_recurring",
    "ad_hoc_protected",
    "ad_hoc_adjustable",
    "undecided",
]
FLOW_ROW_LABELS: dict[str, str] = {
    "income_undetermined": "수입 (정기·비정기 구분 전)",
    "committed_loan": "약정 지급 · 대출 원리금",
    "committed_installment": "약정 지급 · 할부 회차",
    "committed_recurring": "약정 지급 · 정기 지급",
    "ad_hoc_protected": "수시 지출 · 보호",
    "ad_hoc_adjustable": "수시 지출 · 조정 가능",
    "undecided": "미정",
    "transfer_undetermined": "이체 (투자·저축 구분 전)",
    "other_type": "기타 유형",
}


class ReadStatusReason(BaseModel):
    code: StatusReasonCode
    label: str
    periods: list[str] = Field(default_factory=list)
    detail: str | None = None


class ReadAsOf(BaseModel):
    """Data dates. Snapshot kinds are never merged into one date."""

    transaction_as_of: date | None = Field(
        default=None, description="반영된 유효 거래가 덮는 마지막 날(거래 기준일)."
    )
    first_transaction_date: date | None = None
    last_closed_period: str | None = Field(
        default=None, description="거래 자료가 말일까지 덮은 가장 최근 달(YYYY-MM)."
    )
    in_progress_period: str | None = Field(
        default=None, description="자료가 말일까지 오지 않은 달(YYYY-MM). 없으면 null."
    )
    snapshot_as_of: SnapshotAsOf = Field(default_factory=SnapshotAsOf)


class ReadPeriodState(BaseModel):
    period: str
    coverage: PeriodCoverage
    coverage_label: str
    month_status: MonthStatus | None = Field(
        default=None, description="가져온 달만. closed 또는 in_progress."
    )
    status: ReadStatus
    status_label: str
    transaction_count: int = 0
    total_outflow: int = 0
    adjustability_undecided_total: int = 0
    adjustability_undecided_share: float | None = None


class ReadPeriodScope(BaseModel):
    start_period: str | None
    end_period: str | None
    periods: list[ReadPeriodState]


class ReadClassificationState(BaseModel):
    """How complete the human classification is for the response's scope."""

    adjustability_undecided_total: int = Field(
        description="조정 가능성 미정 지출 순액(원)."
    )
    total_outflow: int = Field(description="같은 범위의 총지급(원).")
    adjustability_undecided_share: float | None = Field(
        description="금액 기준 미정 비중 = 미정 ÷ 총지급. 총지급이 0 이하면 null."
    )
    complete: bool = Field(description="미정 금액이 0이면 true.")


class ReadBasis(BaseModel):
    """One way of stating what was computed and under which assumptions."""

    definition: str
    scope: str
    rules: dict[str, str] = Field(
        default_factory=dict,
        description="부호, 환불, 이체, 대출, 기간 귀속, 통화, 제외 규칙.",
    )
    field_scopes: dict[str, str] = Field(default_factory=dict)
    assumptions: list[str] = Field(default_factory=list)


class ReadEnvelope(BaseModel):
    surface: str
    surface_label: str
    read_surface_version: str = READ_SURFACE_VERSION
    questions: list[QuestionKey]
    status: ReadStatus
    status_label: str
    status_reasons: list[ReadStatusReason] = Field(default_factory=list)
    as_of: ReadAsOf
    period_scope: ReadPeriodScope | None = None
    classification: ReadClassificationState | None = None
    basis: ReadBasis
    labels: dict[str, str] = Field(
        default_factory=dict,
        description="이 응답에 나오는 영문 키 → 한국어 이름.",
    )


class ReadErrorResponse(BaseModel):
    """Body of HTTP 503 when the read query itself failed."""

    surface: str
    read_surface_version: str = READ_SURFACE_VERSION
    status: Literal["query_failed"] = "query_failed"
    status_label: str = STATUS_LABELS["query_failed"]
    detail: str


# --------------------------------------------------------------------------
# Wrapped screen payloads (same views and models as /metrics/*).
# --------------------------------------------------------------------------


class ReadMonthlyFlowData(BaseModel):
    items: list[MonthlyFlowMonth]


class ReadMonthlyFlowResponse(ReadEnvelope):
    data: ReadMonthlyFlowData


class ReadSpendCubeData(BaseModel):
    group_by: list[SpendCubeDimension]
    filters: dict[str, str]
    total_amount: int
    row_count: int
    truncated: bool = Field(
        description="limit 때문에 잘렸으면 true. total_amount는 잘리기 전 전체 합계."
    )
    rows: list[SpendCubeRow]


class ReadSpendCubeResponse(ReadEnvelope):
    data: ReadSpendCubeData


class ReadComparisonData(BaseModel):
    comparison: ComparisonBasis
    measures: list[ComparisonMeasure]
    residual_rate: ComparisonRatio | None


class ReadComparisonResponse(ReadEnvelope):
    data: ReadComparisonData


class ReadContributionsData(BaseModel):
    comparison: ComparisonBasis
    adjustability: str
    level: str
    category: str | None
    ordering: str
    target_total: int | None
    baseline_total: int | None
    change_total: int | None
    items: list[ContributionItem]
    twelve_month_window: TwelveMonthWindowBasis
    twelve_month_items: list[ContributionItem]


class ReadContributionsResponse(ReadEnvelope):
    data: ReadContributionsData


# --------------------------------------------------------------------------
# Post-hoc review list (3.3: purchase-gate + spending-review + anomalies).
# --------------------------------------------------------------------------

ReviewItemSubject = Literal["transaction", "category_month"]
ReviewListedBecauseSource = Literal["purchase_review_candidate", "spending_anomaly"]
REVIEW_SOURCE_LABELS: dict[str, str] = {
    "purchase_review_candidate": "구매 단위 사후 검토 후보",
    "spending_anomaly": "카테고리 지출 변화",
}
REVIEW_SUBJECT_LABELS: dict[str, str] = {
    "transaction": "거래",
    "category_month": "카테고리·월",
}
REVIEW_REASON_LABELS: dict[str, str] = {
    "large_oneoff": "큰 일회성 지출",
    "new_merchant": "처음 등장한 거래처",
    "merchant_spike": "거래처 지출 급증",
    "discretionary_spike": "카테고리 재량 지출 급증",
    "category_increase": "카테고리 지출 증가",
    "category_decrease": "카테고리 지출 감소",
    "possible_cancellation": "취소 가능성 확인 필요",
}


class ReviewListedBecause(BaseModel):
    source: ReviewListedBecauseSource
    source_label: str
    code: str = Field(description="검출기가 낸 사유 코드. 새 점수가 아니다.")
    code_label: str
    detail: str | None = Field(
        default=None, description="검출기가 낸 설명 문장 그대로."
    )
    signals: dict[str, int | float | str | bool] = Field(
        default_factory=dict,
        description="검출기가 쓴 기준값과 임계값 그대로(금액은 원, 비율은 배수).",
    )


class ReviewItem(BaseModel):
    subject: ReviewItemSubject
    subject_label: str
    period: str
    date: dt.date | None = Field(default=None, description="subject=transaction일 때.")
    transaction_id: int | None = None
    category: str
    merchant: str | None = None
    amount: int = Field(description="검토 대상 금액(원, 지출 양수).")
    baseline_amount: int | None = Field(
        default=None,
        description="subject=category_month일 때 비교 계약 기준값(원).",
    )
    change_amount: int | None = None
    review_status: str | None = Field(
        default=None,
        description="subject=transaction일 때 사람이 남긴 검토 상태(pending 등).",
    )
    listed_because: list[ReviewListedBecause]


class ReadReviewItemsData(BaseModel):
    period: str | None
    start_date: date | None
    end_date: date | None
    ordering: Literal["subject_then_amount_desc"] = "subject_then_amount_desc"
    total: int
    truncated: bool
    items: list[ReviewItem]
    comparison: ComparisonBasis | None = Field(
        default=None, description="카테고리 지출 변화가 쓴 비교 계약."
    )


class ReadReviewItemsResponse(ReadEnvelope):
    data: ReadReviewItemsData


# --------------------------------------------------------------------------
# Commitments (Q4).
# --------------------------------------------------------------------------

ObservationState = Literal[
    "observed",
    "expected_not_observed",
    "unlinked_transaction_present",
    "not_expected",
    "not_determinable",
]
OBSERVATION_STATE_LABELS: dict[str, str] = {
    "observed": "관측됨",
    "expected_not_observed": "주기상 있어야 하는데 관측 안 됨",
    "unlinked_transaction_present": "거래는 있으나 연결 미확인",
    "not_expected": "이 기간에 예정된 회차 없음",
    "not_determinable": "판단할 근거가 기록되지 않음",
}
ObservationReason = Literal[
    "linked_transactions_in_period",
    "member_transactions_in_period",
    "no_linked_transaction_for_due_installment",
    "flagged_unlinked_installment_transaction",
    "no_member_transaction_in_cycle_month",
    "no_linked_repayment_in_month",
    "outside_commitment_dates",
    "off_cycle_month",
    "cycle_not_recorded",
    "cycle_interval_not_recorded",
    "start_not_recorded",
    "all_counts_observed",
    "in_progress_month_not_yet_observed",
    "period_without_transactions",
    "period_not_imported",
    "commitment_inactive",
]
OBSERVATION_REASON_LABELS: dict[str, str] = {
    "linked_transactions_in_period": "이 기간에 연결된 거래가 있음",
    "member_transactions_in_period": "이 기간에 묶음에 속한 거래가 있음",
    "no_linked_transaction_for_due_installment": "이 기간 회차에 연결된 거래가 없음",
    "flagged_unlinked_installment_transaction": (
        "같은 거래처에 할부로 표시됐지만 계획에 연결되지 않은 거래가 있음"
    ),
    "no_member_transaction_in_cycle_month": "주기상 해당 달인데 묶음에 속한 거래가 없음",
    "no_linked_repayment_in_month": "월 상환액이 기록된 대출인데 이 달 연결된 상환 거래가 없음",
    "outside_commitment_dates": "약정의 시작·종료 기간 밖",
    "off_cycle_month": "주기상 해당하지 않는 달",
    "cycle_not_recorded": "주기가 기록되지 않음",
    "cycle_interval_not_recorded": "회차 약정의 간격이 기록되지 않음",
    "start_not_recorded": "시작 시점이 기록되지 않았고 관측된 거래도 없음",
    "all_counts_observed": "기록된 총 횟수만큼 이미 관측됨",
    "in_progress_month_not_yet_observed": "진행월이라 아직 관측 여부를 판단하지 않음",
    "period_without_transactions": (
        "가져온 기간이지만 이 달 거래가 0건이라 자료 공백과 구분할 수 없음"
    ),
    "period_not_imported": "아직 가져오지 않은 기간",
    "commitment_inactive": "종료되었거나 취소된 약정",
}
CommitmentCycleKey = Literal["monthly", "yearly", "n_times"]
CYCLE_LABELS: dict[str, str] = {
    "monthly": "매월",
    "yearly": "매년",
    "n_times": "회차 약정",
}
MonthlyBurdenBasis = Literal[
    "recorded_monthly_payment",
    "plan_monthly_amount",
    "last_observed_closed_month",
    "not_available",
]
MONTHLY_BURDEN_BASIS_LABELS: dict[str, str] = {
    "recorded_monthly_payment": "대출 스냅샷에 기록된 월 상환액",
    "plan_monthly_amount": "할부 계획의 월 금액",
    "last_observed_closed_month": "최근 마감월에 관측된 묶음 합계",
    "not_available": "기록된 월 금액 없음",
}
CommitmentLifecycle = Literal["active", "ended", "unknown"]
LIFECYCLE_LABELS: dict[str, str] = {
    "active": "진행 중",
    "ended": "종료",
    "unknown": "확인 불가",
}


class CommitmentObservation(BaseModel):
    period: str
    state: ObservationState
    state_label: str
    reason: ObservationReason
    reason_label: str
    observed_amount: int = Field(
        description="이 기간 이 약정에 속한 지출 순액(원, 월 흐름표와 같은 줄)."
    )
    observed_transaction_count: int
    transaction_ids: list[int] = Field(
        default_factory=list,
        description=(
            "state=unlinked_transaction_present일 때 연결 미확인 거래, "
            "state=observed일 때 이 기간 연결된 거래(최대 20건)."
        ),
    )


class CommitmentItem(BaseModel):
    commitment_key: str = Field(description="kind:id 형식의 안정 키.")
    kind: Literal["loan", "installment", "recurring"]
    kind_label: str
    source_id: int | None = Field(
        description="loan_account_id / installment_plan_id / recurring_commitment_id."
    )
    name: str
    lifecycle: CommitmentLifecycle
    lifecycle_label: str
    lifecycle_detail: str | None = None
    cycle: CommitmentCycleKey | None
    cycle_label: str
    monthly_burden: int | None = Field(
        description="월 부담(원). 근거는 monthly_burden_basis. 전망이 아니다."
    )
    monthly_burden_basis: MonthlyBurdenBasis
    monthly_burden_basis_label: str
    monthly_burden_source: str | None = Field(
        default=None, description="대출 월 상환액의 출처 표시(기존 값 그대로)."
    )
    start_date: date | None
    end_date: date | None = Field(
        description="기록된 종료 시점: 대출 만기, 할부 마지막 회차 예정일, 묶음 종료일."
    )
    total_count: int | None = Field(
        default=None, description="할부 총 회차 또는 회차 약정의 총 횟수."
    )
    remaining_count: int | None = Field(
        default=None,
        description=(
            "할부: 거래 기준일 뒤에 예정일이 오는 회차 수. 회차 약정: 총 횟수 − 관측된 "
            "거래 수. 대출·월/연 묶음은 기록이 없어 null."
        ),
    )
    linked_count: int | None = Field(
        default=None, description="할부: 연결된 회차 수. 묶음: 속한 거래 수."
    )
    adjustability: Literal["protected", "adjustable", "undecided"]
    adjustability_label: str
    adjustability_basis: str
    last_observed_period: str | None = None
    last_observed_amount: int | None = None
    observation: CommitmentObservation


class ReadCommitmentsData(BaseModel):
    period: str | None
    period_month_status: MonthStatus | None
    totals: dict[str, int] = Field(
        description=(
            "기간 합계(원): monthly_burden_recorded(기록된 월 부담 합, 진행 중 약정만), "
            "observed_amount(관측 합계)."
        )
    )
    counts_by_state: dict[str, int]
    items: list[CommitmentItem]


class ReadCommitmentsResponse(ReadEnvelope):
    data: ReadCommitmentsData


# --------------------------------------------------------------------------
# Data status (Q6).
# --------------------------------------------------------------------------


class SnapshotKindStatus(BaseModel):
    kind: Literal["assets", "loans", "investments", "insurance", "profile"]
    kind_label: str
    as_of: date | None
    days_before_transaction_as_of: int | None = Field(
        description="거래 기준일 − 스냅샷 기준일(일). 음수면 스냅샷이 더 최근."
    )


class ClassificationCompleteness(BaseModel):
    adjustability_undecided_total: int
    adjustability_undecided_transaction_count: int
    total_outflow: int
    adjustability_undecided_share: float | None
    adjustability_decided_share: float | None = Field(
        description="1 − 미정 비중(금액 기준). 총지급이 0 이하면 null."
    )
    uncategorized_expense_total: int = Field(
        description="대분류가 비었거나 '미분류'인 지출 순액(원)."
    )
    uncategorized_expense_transaction_count: int
    installment_link_unconfirmed_transaction_count: int = Field(
        description="할부로 표시됐지만 할부 계획에 연결되지 않은 지출 거래 수."
    )
    commitments_without_cycle: int
    commitments_without_adjustability: int


class CoverageGap(BaseModel):
    period: str
    status: Literal["no_transactions"] = "no_transactions"
    status_label: str = STATUS_LABELS["no_transactions"]


class ReadDataStatusData(BaseModel):
    transaction_coverage: dict[str, str | int | None] = Field(
        description=(
            "first_transaction_date, transaction_as_of, first_period, last_period, "
            "imported_period_count."
        )
    )
    closed_periods: list[str]
    in_progress_period: str | None
    snapshots: list[SnapshotKindStatus]
    classification: ClassificationCompleteness
    coverage_gaps: list[CoverageGap]
    periods: list[ReadPeriodState]
    excluded_currency: list[ExcludedCurrencyItem]
    non_krw_transaction_count: int
    month_end_forecast: dict[str, str] = Field(
        description=(
            "진행월 월말 순현금흐름 전망의 위치. 이 표면은 전망을 다시 계산하지 않는다."
        )
    )


class ReadDataStatusResponse(ReadEnvelope):
    data: ReadDataStatusData


# --------------------------------------------------------------------------
# Index.
# --------------------------------------------------------------------------


class ReadSurfaceEntry(BaseModel):
    key: str
    name: str
    method: Literal["GET"] = "GET"
    path: str | None
    questions: list[QuestionKey]
    definition: str
    availability: Literal["live", "reserved"]
    availability_label: str
    provided_by: str
    parameters: list[str] = Field(default_factory=list)
    notes: str | None = None


class ReadSurfaceIndexResponse(BaseModel):
    read_surface_version: str = READ_SURFACE_VERSION
    auth: str
    entries: list[ReadSurfaceEntry]
    questions: dict[str, str]
    status_vocabulary: dict[str, str]
    format_rules: list[str]
    migration_document: str
