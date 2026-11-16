"""T062 contracts; monthly equivalents are references, never outflow additions."""

from datetime import datetime
from typing import Literal, Self

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.read_surface import ReadEnvelope

TargetKind = Literal["category", "adjustability"]
PERIOD_PATTERN = r"^[1-9]\d{3}-(0[1-9]|1[0-2])$"
ADJUSTABILITY_VALUES = ("protected", "adjustable", "undecided")


class SpendingLimitCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    target_kind: TargetKind
    target_value: str = Field(
        max_length=50,
        description="대분류 정확한 값. 빈 문자열은 미분류. 조정 가능성이면 protected/adjustable/undecided.",
    )
    effective_from_period: str = Field(pattern=PERIOD_PATTERN)
    amount: int | None = Field(
        ge=0,
        le=9_000_000_000_000_000,
        strict=True,
        description="사람이 정한 월 한도(원). null은 이 달부터 한도 해제. 0원도 유효한 한도.",
    )

    @model_validator(mode="after")
    def validate_target(self) -> Self:
        if (
            self.target_kind == "adjustability"
            and self.target_value not in ADJUSTABILITY_VALUES
        ):
            raise ValueError(
                "조정 가능성은 protected, adjustable, undecided 중 하나여야 합니다."
            )
        if self.target_value != self.target_value.strip():
            raise ValueError("대상 앞뒤에 공백을 넣을 수 없습니다.")
        return self


class SpendingLimitRevisionResponse(SpendingLimitCreate):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime


class SpendingLimitHistoryResponse(BaseModel):
    revisions: list[SpendingLimitRevisionResponse]
    last_closed_period: str | None
    history_rule: str


MissingReason = Literal[
    "no_limit_set",
    "month_in_progress",
    "not_imported",
    "no_transactions",
    "partial_month",
]


class LimitComparison(BaseModel):
    target_kind: TargetKind
    target_value: str
    target_label: str
    actual_amount: int | None
    limit_amount: int | None
    limit_revision_id: int | None
    effective_from_period: str | None
    difference_amount: int | None = Field(
        description="실적 − 한도. 양수는 초과, 음수는 한도 미만. 진행월에는 null."
    )
    missing_reason: MissingReason | None
    missing_reason_label: str | None


class AnnualEquivalent(BaseModel):
    category: str = Field(description="유효 대분류. 빈 문자열은 대분류 없음.")
    category_minor: str | None = Field(
        description="유효 소분류. null·빈 값은 null로 묶음."
    )
    source: Literal["observed_pattern", "registered_yearly_commitment"]
    commitment_id: int | None
    commitment_label: str | None
    observed_periods: list[str] = Field(description="월 순지출이 양수인 달, 오름차순.")
    window_amount: int
    monthly_equivalent: int
    active_months_in_window: int


class SpendingReferenceData(BaseModel):
    period: str | None
    total_outflow: int | None
    window_start_period: str | None
    window_end_period: str | None
    annual_missing_reason: (
        Literal["month_in_progress", "incomplete_twelve_month_window"] | None
    )
    annual_missing_reason_label: str | None
    annual_items: list[AnnualEquivalent]
    comparisons: list[LimitComparison]


class ReadSpendingReferenceResponse(ReadEnvelope):
    data: SpendingReferenceData
