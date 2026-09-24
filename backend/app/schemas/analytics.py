from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field


class MonthlyCashflowItem(BaseModel):
    period: str
    income: int
    expense: int
    transfer: int
    net_cashflow: int
    savings_rate: float | None


class MonthlyCashflowResponse(BaseModel):
    items: list[MonthlyCashflowItem]


class CategoryMoMItem(BaseModel):
    period: str
    previous_period: str
    category: str
    current_amount: int
    previous_amount: int
    delta_amount: int
    delta_pct: float | None


class CategoryMoMResponse(BaseModel):
    items: list[CategoryMoMItem]
    reference_date: date | None = None
    is_partial_period: bool = False
    comparison_basis: Literal["same_day_previous_month", "full_previous_month"] = (
        "full_previous_month"
    )


class FixedCostSummaryResponse(BaseModel):
    expense_total: int
    fixed_total: int
    variable_total: int
    fixed_ratio: float | None
    essential_fixed_total: int
    discretionary_fixed_total: int
    essential_variable_total: int
    discretionary_variable_total: int
    required_spend_total: int
    discretionary_spend_total: int
    unclassified_total: int
    unclassified_count: int
    necessity_unclassified_total: int = 0
    necessity_unclassified_count: int = 0


class FixedCostTrendItem(BaseModel):
    period: str
    expense_total: int
    fixed_total: int
    variable_total: int
    essential_fixed_total: int
    discretionary_fixed_total: int
    essential_variable_total: int
    discretionary_variable_total: int
    required_spend_total: int
    discretionary_spend_total: int
    unclassified_total: int
    unclassified_count: int
    necessity_unclassified_total: int = 0
    necessity_unclassified_count: int = 0
    fixed_ratio: float | None


class FixedCostTrendResponse(BaseModel):
    items: list[FixedCostTrendItem]


class MerchantSpendItem(BaseModel):
    merchant: str
    amount: int
    count: int
    avg_amount: float
    last_seen_at: datetime


class MerchantSpendResponse(BaseModel):
    items: list[MerchantSpendItem]


# P1 ── payment-method-patterns
class PaymentMethodPatternItem(BaseModel):
    payment_method: str
    total_amount: int
    transaction_count: int
    avg_amount: int
    pct_of_total: float | None


class PaymentMethodPatternsResponse(BaseModel):
    items: list[PaymentMethodPatternItem]


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


# P1 ── recurring-payments
class RecurringPaymentItem(BaseModel):
    merchant: str
    category: str
    avg_amount: int
    interval_type: str
    avg_interval_days: float
    occurrences: int
    confidence: float
    last_date: date
    recurring_payment_kind: str | None
    installment_count: int
    monthly_recurring_count: int
    not_recurring_count: int
    unclassified_count: int
    transaction_ids: list[int]
    last_charge_date: date | None = None
    net_amount: int = 0
    activity_status: Literal[
        "active_candidate", "historical", "irregular", "non_positive", "not_recurring"
    ] = "historical"


class RecurringPaymentsResponse(BaseModel):
    total: int
    page: int
    per_page: int
    items: list[RecurringPaymentItem]
    reference_date: date | None = None
    activity: Literal["all", "active", "history"] = "all"
    recent_days: int = 90
    assumptions: str


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


class DiscretionaryVelocityResponse(BaseModel):
    period: str
    as_of_date: date
    month_progress_ratio: float
    discretionary_spend: int
    baseline_monthly_spend: int
    baseline_spend_at_same_progress: int
    velocity_ratio: float | None
    risk_level: str
    confidence: str
    classification_coverage_ratio: float | None
    unclassified_spend: int
    income_basis: str | None
    reasons: list[str]
    assumptions: list[str]


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
