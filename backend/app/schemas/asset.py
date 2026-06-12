from enum import StrEnum
from datetime import date
from decimal import Decimal

from typing import Literal

from pydantic import BaseModel, Field


class AssetSnapshotTotalsResponse(BaseModel):
    snapshot_date: date
    asset_total: Decimal
    liability_total: Decimal
    net_worth: Decimal


class NetWorthBreakdownItemResponse(BaseModel):
    side: str
    category: str
    amount: Decimal
    ratio: float | None


class NetWorthBreakdownResponse(BaseModel):
    snapshot_date: date | None
    asset_total: Decimal
    negative_asset_excluded_total: Decimal = Decimal("0")
    liability_total: Decimal
    net_worth: Decimal
    items: list[NetWorthBreakdownItemResponse]


class AssetLiabilityHealthResponse(BaseModel):
    snapshot_date: date | None
    cash_equivalent_total: Decimal
    asset_total: Decimal
    negative_asset_excluded_total: Decimal = Decimal("0")
    liability_total: Decimal
    net_worth: Decimal
    monthly_required_spend: Decimal
    monthly_required_spend_source: str = "manual_query_param"
    emergency_fund_months: float | None
    emergency_fund_target_months: int
    target_progress_ratio: float | None
    monthly_debt_payment: Decimal
    monthly_income: Decimal
    monthly_income_source: str = "manual_query_param"
    derived_from_periods: list[str] = Field(default_factory=list)
    manual_input_overrides: list[str] = Field(default_factory=list)
    debt_payment_ratio: float | None
    debt_to_asset_ratio: float | None
    confidence: str
    assumptions: list[str]


class AssetLiquidityPatchRequest(BaseModel):
    liquidity_tier: Literal["immediate", "near_liquid", "illiquid"] | None = None
    is_cash_equivalent: bool | None = None


class AssetSnapshotItemResponse(BaseModel):
    id: int
    snapshot_date: date
    side: str
    category: str
    product_name: str
    amount: Decimal
    liquidity_tier: str | None
    is_cash_equivalent: bool | None


class AssetSnapshotsResponse(BaseModel):
    items: list[AssetSnapshotTotalsResponse]
    asset_items: list[AssetSnapshotItemResponse] = Field(default_factory=list)


class SnapshotComparisonMode(StrEnum):
    LATEST_AVAILABLE_VS_PREVIOUS_AVAILABLE = "latest_available_vs_previous_available"
    LAST_CLOSED_MONTH_VS_PREVIOUS_CLOSED_MONTH = (
        "last_closed_month_vs_previous_closed_month"
    )
    SELECTED_SNAPSHOT_VS_BASELINE_SNAPSHOT = "selected_snapshot_vs_baseline_snapshot"


class AssetSnapshotComparisonDeltaResponse(BaseModel):
    asset_total: Decimal
    liability_total: Decimal
    net_worth: Decimal
    asset_total_pct: float | None
    liability_total_pct: float | None
    net_worth_pct: float | None


class AssetSnapshotComparisonResponse(BaseModel):
    comparison_mode: SnapshotComparisonMode
    current: AssetSnapshotTotalsResponse | None
    baseline: AssetSnapshotTotalsResponse | None
    delta: AssetSnapshotComparisonDeltaResponse | None
    comparison_days: int | None
    is_partial: bool
    is_stale: bool
    can_compare: bool
    comparison_label: str


class NetWorthPointResponse(BaseModel):
    snapshot_date: date
    net_worth: Decimal


class NetWorthHistoryResponse(BaseModel):
    items: list[NetWorthPointResponse]


class InvestmentItemResponse(BaseModel):
    product_type: str | None
    broker: str
    product_name: str
    cost_basis: Decimal | None
    market_value: Decimal | None
    return_rate: Decimal | None
    pct_of_investment_total: float | None = None


class InvestmentTotalsResponse(BaseModel):
    cost_basis: Decimal
    market_value: Decimal


class InvestmentSummaryResponse(BaseModel):
    snapshot_date: date | None
    items: list[InvestmentItemResponse]
    totals: InvestmentTotalsResponse


class InsuranceContractItemResponse(BaseModel):
    id: int
    snapshot_date: date
    insurer: str
    product_name: str
    contract_status: str | None
    total_paid: Decimal | None
    contract_date: date | None
    maturity_date: date | None


class InsurancePremiumEstimateResponse(BaseModel):
    period: str | None
    amount: Decimal | None
    assumptions: list[str]
    basis: dict[str, object] | None = None


class InsuranceSummaryResponse(BaseModel):
    snapshot_date: date | None
    has_contract_snapshot: bool = False
    missing_reason: str | None = None
    expected_source: str = "BankSalad 4.보험현황"
    items: list[InsuranceContractItemResponse]
    monthly_premium_estimate: InsurancePremiumEstimateResponse


class LoanItemResponse(BaseModel):
    id: int | None = None
    loan_type: str | None
    lender: str
    product_name: str
    principal: Decimal | None
    balance: Decimal | None
    interest_rate: Decimal | None
    monthly_payment: Decimal | None = None
    repayment_method: str | None = None
    monthly_payment_source: str | None = None
    repayment_method_source: str | None = None
    loan_kind: str | None = None
    start_date: date | None
    maturity_date: date | None


class LoanRepaymentMetadataPatchRequest(BaseModel):
    monthly_payment: Decimal | None = Field(default=None, ge=0)
    repayment_method: (
        Literal[
            "principal_interest",
            "principal_equal",
            "interest_only",
            "unknown",
        ]
        | None
    ) = None


class LoanRepaymentMetadataResponse(BaseModel):
    id: int
    snapshot_date: date
    lender: str
    product_name: str
    monthly_payment: Decimal | None
    repayment_method: str | None
    monthly_payment_source: str | None = None
    repayment_method_source: str | None = None


class LoanTotalsResponse(BaseModel):
    principal: Decimal
    balance: Decimal


class LoanSummaryResponse(BaseModel):
    snapshot_date: date | None
    as_of_date: date | None = None
    summary_scope: str = "active_loans_only"
    excluded_historical_count: int = 0
    items: list[LoanItemResponse]
    totals: LoanTotalsResponse
