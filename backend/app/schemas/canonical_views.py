from datetime import date
from typing import Literal

from pydantic import BaseModel, Field, model_validator


class CanonicalMonthlyCashflowItem(BaseModel):
    period: str
    income_total: int
    expense_total: int
    non_loan_expense_total: int
    transfer_activity_total: int
    loan_repayment_total: int
    fixed_total: int
    variable_total: int
    essential_fixed_total: int
    discretionary_fixed_total: int
    essential_variable_total: int
    discretionary_variable_total: int
    required_spend_total: int
    discretionary_spend_total: int
    unclassified_expense_total: int
    net_cashflow: int
    savings_rate: float | None


class CanonicalTrueSpendableMonthlyItem(BaseModel):
    period: str
    income_total: int
    observed_income_total: int | None = None
    loan_repayment_total: int
    fixed_commitment_total: int
    variable_total: int
    required_variable_total: int
    discretionary_variable_total: int
    spendable_before_variable_spend: int
    remaining_after_variable_spend: int
    income_basis: Literal["observed", "estimated"] = "observed"
    is_income_estimated: bool = False
    estimated_income_total: int | None = None
    income_estimate_month_count: int = 0
    income_estimate_source: str | None = None
    excluded_income_periods: list[str] = Field(default_factory=list)
    estimated_spendable_before_variable_spend: int | None = None
    estimated_remaining_after_variable_spend: int | None = None

    @model_validator(mode="after")
    def set_observed_income_total(self) -> "CanonicalTrueSpendableMonthlyItem":
        if self.observed_income_total is None:
            self.observed_income_total = self.income_total
        return self


class CanonicalLoanRepaymentMonthlyItem(BaseModel):
    period: str
    loan_account_id: int
    loan_display_name: str | None
    loan_lender: str | None
    loan_product_name: str | None
    loan_kind: str | None
    loan_maturity_date: date | None
    loan_repayment_type: str | None
    repayment_total: int
    transaction_count: int


class CanonicalMerchantMonthlyBaselineItem(BaseModel):
    period: str
    merchant: str
    effective_category_major: str
    effective_category_minor: str | None
    monthly_spend: int
    transaction_count: int
    baseline_month_count: int
    trailing_3_month_avg: float | None
    baseline_delta: float | None
    baseline_delta_pct: float | None


class CanonicalRecurringMerchantMonthlyItem(BaseModel):
    period: str
    merchant: str
    recurring_payment_kind: str
    monthly_spend: int
    transaction_count: int
    first_date: date
    last_date: date


class CanonicalUnclassifiedWorkQueueItem(BaseModel):
    transaction_id: int
    date: date
    type: str
    merchant: str
    effective_category_major: str
    effective_category_minor: str | None
    amount: int
    amount_abs: int
    needs_cost_kind: bool
    needs_fixed_cost_necessity: bool
    needs_spend_necessity: bool = False
    needs_recurring_payment_kind: bool
    needs_loan_link_review: bool
    merchant_expense_count: int
    priority_score: int
    priority_reason: str


class CanonicalViewsDashboardResponse(BaseModel):
    monthly_cashflow: list[CanonicalMonthlyCashflowItem]
    true_spendable_monthly: list[CanonicalTrueSpendableMonthlyItem]
    loan_repayment_monthly: list[CanonicalLoanRepaymentMonthlyItem]
    merchant_monthly_baseline: list[CanonicalMerchantMonthlyBaselineItem]
    recurring_merchant_monthly: list[CanonicalRecurringMerchantMonthlyItem]
    unclassified_work_queue: list[CanonicalUnclassifiedWorkQueueItem]
