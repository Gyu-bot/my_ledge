from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.comparison import ComparisonBasis
from app.schemas.metrics import MetricContract, MonthStatus


class MonthlyCashflowItem(BaseModel):
    period: str
    income: int
    expense: int
    transfer: int
    net_cashflow: int
    savings_rate: float | None
    month_status: MonthStatus | None = None


class MonthlyCashflowResponse(BaseModel):
    items: list[MonthlyCashflowItem]
    contract: MetricContract | None = None


class MerchantSpendItem(BaseModel):
    merchant: str
    amount: int
    count: int
    avg_amount: float
    last_seen_at: datetime


class MerchantSpendResponse(BaseModel):
    items: list[MerchantSpendItem]
    contract: MetricContract | None = None


# P1 ── payment-method-patterns
class PaymentMethodPatternItem(BaseModel):
    payment_method: str
    total_amount: int
    transaction_count: int
    avg_amount: int
    pct_of_total: float | None


class PaymentMethodPatternsResponse(BaseModel):
    items: list[PaymentMethodPatternItem]
    contract: MetricContract | None = None


# P1 ── income-stability
class IncomeMonthlyItem(BaseModel):
    period: str
    income: int


class IncomeStabilityResponse(BaseModel):
    items: list[IncomeMonthlyItem]
    avg: int
    stdev: float | None
    coefficient_of_variation: float | None
    comparison_mode: str
    reference_date: date
    is_partial_period: bool
    assumptions: str
    contract: MetricContract | None = None


# P1 ── recurring-payments


# P1 ── spending-anomalies
class SpendingAnomalyItem(BaseModel):
    period: str
    category: str
    amount: int
    baseline_avg: int
    delta_pct: float | None
    delta_pct_raw: float | None = None
    delta_pct_display: float | None = None
    delta_display_capped: bool = False
    baseline_quality: str = "sufficient"
    anomaly_mode: str = "standard"
    direction: Literal["increase", "decrease"] = "increase"
    anomaly_score: float
    reason: str


class SpendingAnomaliesResponse(BaseModel):
    total: int
    page: int
    per_page: int
    items: list[SpendingAnomalyItem]
    comparison_mode: str
    reference_date: date
    is_partial_period: bool
    assumptions: str
    contract: MetricContract | None = None
    comparison: ComparisonBasis | None = None


class PurchaseGateCandidateItem(BaseModel):
    candidate_type: str
    candidate_types: list[str]
    transaction_id: int
    candidate_key: str
    date: date
    merchant: str
    amount: int
    category: str
    signals: dict[str, int | float | str | bool]
    risk_level: str
    review_priority: str
    confidence: str
    suggested_review_window: str
    reasons: list[str]
    assumptions: list[str]
    review_status: str
    possible_cancellation: bool = False
    cancellation_evidence_transaction_ids: list[int] = Field(default_factory=list)
    review_memo: str | None = None
    reviewed_at: datetime | None = None
    cooldown_until: datetime | None = None
    review_timing: Literal["post_transaction"] = "post_transaction"
    candidate_purpose: Literal["future_friction_rule_candidate"] = (
        "future_friction_rule_candidate"
    )
    future_friction_suggestion: dict[str, object] | None = None


class PurchaseGateCandidatesResponse(BaseModel):
    total: int
    page: int
    per_page: int
    items: list[PurchaseGateCandidateItem]
    start_date: date | None = None
    end_date: date | None = None
    assumptions: list[str]
    contract: MetricContract | None = None


PurchaseGateReviewStatus = Literal[
    "pending",
    "reviewed",
    "ignored",
    "snoozed",
    "dismissed",
]


class PurchaseGateReviewPatchRequest(BaseModel):
    review_status: PurchaseGateReviewStatus
    memo: str | None = None
    cooldown_days: int | None = None


class PurchaseGateReviewResponse(BaseModel):
    candidate_key: str
    candidate_type: str
    transaction_id: int
    review_status: PurchaseGateReviewStatus
    memo: str | None = None
    reviewed_at: datetime | None = None
    cooldown_until: datetime | None = None
