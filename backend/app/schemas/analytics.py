from datetime import date, datetime

from pydantic import BaseModel


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


class FixedCostSummaryResponse(BaseModel):
    expense_total: int
    fixed_total: int
    variable_total: int
    fixed_ratio: float | None
    essential_fixed_total: int
    discretionary_fixed_total: int
    unclassified_total: int
    unclassified_count: int


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


class RecurringPaymentsResponse(BaseModel):
    total: int
    page: int
    per_page: int
    items: list[RecurringPaymentItem]
    assumptions: str


# P1 ── spending-anomalies
class SpendingAnomalyItem(BaseModel):
    period: str
    category: str
    amount: int
    baseline_avg: int
    delta_pct: float | None
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
