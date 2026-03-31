from datetime import datetime

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
