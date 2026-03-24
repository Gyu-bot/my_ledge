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
