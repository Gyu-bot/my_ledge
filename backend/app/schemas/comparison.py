"""Comparison contract schemas (T057, Implentation-plan.md 2.4).

Every comparison states its target period, its baseline period, and how a
partial (in-progress) month was handled.
"""

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.metrics import (
    MONTH_DATA_COVERAGE_RULE,
    MetricContract,
    MonthDataCoverage,
    MonthDataCoverageReason,
    MonthStatus,
)

ComparisonAdjustabilityView = Literal["all", "protected", "adjustable"]
ComparisonLevel = Literal["category", "merchant"]
BaselineMethod = Literal["median_of_recent_closed_months", "previous_month"]
PartialMonthHandling = Literal["closed_month_full", "same_elapsed_days"]
TargetCoverage = Literal["observed", "no_data"]
BaselineStatus = Literal["full", "fewer_than_requested", "none"]
BaselineLimitedBy = Literal["baseline_start_date", "data_start"]
BaselineUnavailableReason = Literal["baseline_start_date", "data_start", "no_data"]
ComparisonWindowKind = Literal["monthly", "twelve_month"]
ItemCadence = Literal["monthly", "annual_like"]


class ComparisonSkippedMonth(BaseModel):
    period: str
    reason: Literal["no_data"] = Field(
        description=(
            "no_data: 유효 거래가 한 건도 없는 달(자료 없음). 0원으로 세지 않고 "
            "기준 기간에서 빼고 더 이전 마감월을 찾는다."
        )
    )


class ComparisonBasis(BaseModel):
    """What was compared with what, and how a partial month was handled."""

    definition: str = "comparison.v1"
    target_period: str | None = Field(
        description="대상 월(YYYY-MM). 자료가 없으면 null."
    )
    target_month_status: MonthStatus | None = None
    target_coverage: TargetCoverage | None = Field(
        default=None,
        description="observed: 대상 월에 유효 거래가 있음. no_data: 자료 없는 달.",
    )
    target_start_date: date | None = None
    target_end_date: date | None = Field(
        default=None,
        description="대상 금액에 포함한 마지막 날짜. 진행월이면 거래 기준일.",
    )
    baseline_method: BaselineMethod = "median_of_recent_closed_months"
    baseline_method_label: str = "최근 마감월 중앙값"
    baseline_months_requested: int = Field(
        description="기준 기간으로 찾는 마감월 수(기본 6)."
    )
    baseline_periods: list[str] = Field(
        description="기준 기간에 실제로 쓴 마감월(최근 순서가 아니라 오름차순)."
    )
    baseline_month_count: int
    baseline_status: BaselineStatus = Field(
        description=(
            "full: 요청한 수만큼 찾음. fewer_than_requested: 일부만 찾음. "
            "none: 기준 기간이 없어 비교 값이 null."
        )
    )
    baseline_limited_by: BaselineLimitedBy | None = Field(
        default=None,
        description="요청한 수보다 적을 때 그 이유: 기준 구간 시작일 또는 자료 시작.",
    )
    baseline_start_date: date | None = Field(
        default=None,
        description="사용자 설정(analytics.comparison.baseline_start_date). null이면 제한 없음.",
    )
    baseline_start_period: str | None = Field(
        default=None,
        description=(
            "기준 구간 시작일이 적용된 첫 달. 시작일이 1일이면 그 달, 아니면 다음 달부터 "
            "기준 기간에 들어간다."
        ),
    )
    first_data_period: str | None = Field(
        default=None,
        description="유효 거래가 시작된 달.",
    )
    first_data_period_starts_mid_month: bool = Field(
        default=False,
        description=(
            "첫 거래일이 1일이 아님. 그 달은 월초 자료가 없어 중앙값 기준 기간과 "
            "12개월 구간에 넣지 않는다(baseline_limited_by=data_start). 전월 비교의 "
            "기준이 그 달이면 partial_month_note가 알린다."
        ),
    )
    skipped_periods: list[ComparisonSkippedMonth] = Field(default_factory=list)
    partial_month_handling: PartialMonthHandling
    elapsed_day: int | None = Field(
        default=None,
        description=(
            "same_elapsed_days일 때 대상과 기준 월 모두 1일부터 이 날짜까지만 누적한다. "
            "이 날짜가 없는 짧은 달은 그 달 전체."
        ),
    )
    partial_month_note: str
    ratio_metrics_available: bool = Field(
        description="비율 지표(현금 잔여율 등)는 마감월 대상일 때만 낸다."
    )
    previous_full_month_delta_available: bool = Field(
        description=(
            "이 응답의 증감(change_amount)이 월 전체끼리의 비교로 실제로 들어 있으면 "
            "true: 대상 월이 마감월이고 자료가 있으며 기준 월이 하나 이상 있을 때. "
            "기준은 baseline_method를 따른다(previous_month면 직전 마감월 하나, "
            "기본이면 최근 마감월 중앙값). 진행월 대상(같은 경과일 비교), 기준 기간 "
            "없음, 대상 월 자료 없음이면 false."
        )
    )
    baseline_unavailable_reason: BaselineUnavailableReason | None = Field(
        default=None,
        description=(
            "기준 월을 하나도 쓰지 못했을 때(baseline_status=none) 그 이유: data_start "
            "(자료 시작 전이거나 월중 시작 첫 달), baseline_start_date(기준 구간 시작일 "
            "전), no_data(그 달 유효 거래 0건). 기준값은 채우지 않고 null로 둔다."
        ),
    )
    target_data_coverage: MonthDataCoverage | None = Field(
        default=None,
        description=(
            "대상 월의 자료 범위(data_coverage_rule). target_coverage(거래 유무)와 "
            "target_month_status(달력 상태)와 따로 읽는다."
        ),
    )
    target_data_coverage_reasons: list[MonthDataCoverageReason] = Field(
        default_factory=list
    )
    data_coverage_rule: str = MONTH_DATA_COVERAGE_RULE
    zero_vs_no_data_rule: str = (
        "자료 없는 달(유효 거래 0건)은 기준 기간에서 빠지고 skipped_periods에 남는다. "
        "자료가 있는 달에 해당 항목 지출이 없으면 0원으로 중앙값에 들어간다."
    )
    median_rule: str = (
        "기준값은 기준 기간 월별 금액의 중앙값이다. 달 수가 짝수면 가운데 두 값의 평균을 "
        "원 단위로 반올림(0.5는 0에서 먼 쪽)한다. 항목별 중앙값은 더해도 전체 중앙값과 "
        "같지 않다."
    )


class ComparisonValue(BaseModel):
    period: str
    amount: int


class ComparisonMeasure(BaseModel):
    key: str
    label: str
    target_amount: int | None = Field(
        description="대상 월 금액. 대상 월이 자료 없는 달이면 null."
    )
    baseline_amount: int | None = Field(
        description="기준 기간 월별 금액의 중앙값. 기준 기간이 없으면 null."
    )
    change_amount: int | None = Field(
        description="target_amount − baseline_amount (원). 어느 한쪽이 null이면 null."
    )
    baseline_values: list[ComparisonValue]


class ComparisonRatio(BaseModel):
    key: Literal["residual_rate"] = "residual_rate"
    label: str = "현금 잔여율"
    target_rate: float | None
    baseline_rate: float | None = Field(
        description="기준 기간 월별 현금 잔여율의 중앙값(수입이 양수인 달만)."
    )


class ComparisonMonthlyFlowResponse(BaseModel):
    contract: MetricContract
    comparison: ComparisonBasis
    measures: list[ComparisonMeasure]
    residual_rate: ComparisonRatio | None = Field(
        description="마감월 대상일 때만. 진행월 대상이면 null."
    )


class ContributionItem(BaseModel):
    category: str
    merchant: str | None = Field(
        default=None, description="level=merchant일 때 카테고리 안의 거래처."
    )
    cadence: ItemCadence = Field(
        description=(
            "annual_like: 대상 월로 끝나는 12개월 창(전부 자료 있음) 중 지출이 있는 달이 "
            "1–2개. 나머지는 monthly."
        )
    )
    window: ComparisonWindowKind
    target_amount: int = Field(
        description="window=monthly: 대상 월 금액. window=twelve_month: 대상 월로 끝나는 12개월 합계."
    )
    target_period_amount: int = Field(description="대상 월 한 달의 금액.")
    baseline_amount: int | None
    change_amount: int | None = Field(
        description="금액 기여(원). 정렬 기준은 이 값의 절댓값."
    )
    baseline_observed_month_count: int = Field(
        default=0, description="기준 기간 중 이 항목 금액이 0이 아닌 달 수."
    )
    baseline_zero_month_count: int = Field(
        default=0,
        description="기준 기간 중 자료는 있으나 이 항목 금액이 0인 달 수.",
    )
    active_months_in_window: int = Field(
        description="대상 월로 끝나는 12개월 창에서 순지출이 양수인 달 수."
    )
    baseline_note: str | None = None


class TwelveMonthWindowBasis(BaseModel):
    rule: str = (
        "해마다 한두 번 나가는 지출(annual_like)은 대상 월로 끝나는 12개월 합계를 그 "
        "직전 12개월 합계와 비교한다. 진행월이면 두 창의 마지막 달을 같은 경과일까지만 "
        "누적한다."
    )
    target_window_start_period: str | None
    target_window_end_period: str | None
    baseline_window_start_period: str | None
    baseline_window_end_period: str | None
    target_window_complete: bool = Field(
        description="대상 창 12개월이 모두 자료가 있는 달인가. 아니면 annual_like 판정을 하지 않는다."
    )
    baseline_window_available: bool = Field(
        description="직전 12개월이 모두 자료가 있고 기준 구간 시작일 이후인가."
    )
    baseline_window_unavailable_reason: (
        Literal["no_data", "baseline_start_date", "data_start"] | None
    ) = None


class ContributionResponse(BaseModel):
    contract: MetricContract
    comparison: ComparisonBasis
    adjustability: ComparisonAdjustabilityView
    level: ComparisonLevel
    category: str | None = None
    ordering: Literal["abs_change_amount_desc"] = "abs_change_amount_desc"
    target_total: int | None
    baseline_total: int | None = Field(
        description="이 보기(전체·보호·조정 가능) 월 합계의 기준 기간 중앙값."
    )
    change_total: int | None
    items: list[ContributionItem] = Field(
        description="월 단위 비교(cadence=monthly). 금액 기여 절댓값 순."
    )
    twelve_month_window: TwelveMonthWindowBasis
    twelve_month_items: list[ContributionItem] = Field(
        description="12개월 창 비교(cadence=annual_like). 금액 기여 절댓값 순."
    )
