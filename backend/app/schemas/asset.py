from enum import StrEnum
from datetime import date
from decimal import Decimal

from pydantic import BaseModel


class AssetSnapshotTotalsResponse(BaseModel):
    snapshot_date: date
    asset_total: Decimal
    liability_total: Decimal
    net_worth: Decimal


class AssetSnapshotsResponse(BaseModel):
    items: list[AssetSnapshotTotalsResponse]


class SnapshotComparisonMode(StrEnum):
    LATEST_AVAILABLE_VS_PREVIOUS_AVAILABLE = "latest_available_vs_previous_available"
    LAST_CLOSED_MONTH_VS_PREVIOUS_CLOSED_MONTH = "last_closed_month_vs_previous_closed_month"
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


class InvestmentTotalsResponse(BaseModel):
    cost_basis: Decimal
    market_value: Decimal


class InvestmentSummaryResponse(BaseModel):
    snapshot_date: date | None
    items: list[InvestmentItemResponse]
    totals: InvestmentTotalsResponse


class LoanItemResponse(BaseModel):
    loan_type: str | None
    lender: str
    product_name: str
    principal: Decimal | None
    balance: Decimal | None
    interest_rate: Decimal | None
    start_date: date | None
    maturity_date: date | None


class LoanTotalsResponse(BaseModel):
    principal: Decimal
    balance: Decimal


class LoanSummaryResponse(BaseModel):
    snapshot_date: date | None
    items: list[LoanItemResponse]
    totals: LoanTotalsResponse
