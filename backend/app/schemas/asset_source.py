from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

Source = Literal["banksalad_snapshot", "toss_securities_api"]
Lifecycle = Literal[
    "active",
    "hidden_by_user",
    "matured_candidate",
    "matured_confirmed",
    "replaced",
    "duplicate",
    "conflict",
    "stale",
    "needs_review",
]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class AccountSourceOverride(StrictModel):
    account_key: str = Field(min_length=1, max_length=180)
    source: Source


class SourcePolicy(StrictModel):
    global_source: Literal["banksalad_snapshot"] = "banksalad_snapshot"
    investment_source: Source = "banksalad_snapshot"
    stale_after_days: int = Field(default=7, ge=1, le=365)
    account_overrides: list[AccountSourceOverride] = Field(
        default_factory=list, max_length=100
    )

    @model_validator(mode="after")
    def distinct_accounts(self):
        if len({x.account_key for x in self.account_overrides}) != len(
            self.account_overrides
        ):
            raise ValueError("duplicate account override")
        return self


class SourcePolicyResponse(SourcePolicy):
    revision: int = 0


class SourcePolicyPreviewRequest(StrictModel):
    policy: SourcePolicy


class SourcePolicyApplyRequest(SourcePolicyPreviewRequest):
    preview_token: str
    confirmed: Literal[True]
    reason: str = Field(
        default="사용자가 소스 선택을 확인함", min_length=1, max_length=500
    )


class SourceHolding(BaseModel):
    account_key: str
    instrument_key: str
    product_name: str
    market_value: Decimal | None
    currency: str
    source: Source
    quantity: Decimal | None = None
    native_currency: str | None = None
    native_market_value: Decimal | None = None
    exchange_rate: Decimal | None = None


class SourceAccountStatus(BaseModel):
    account_key: str
    broker: str
    configured_source: Source
    effective_source: Source | None
    selected_run_id: int | None
    valuation_at: datetime | None
    valuation_precision: Literal["date", "timestamp", "observation_proxy"] = "date"
    ingested_at: datetime | None
    account_scope: Literal["broker_group"] = "broker_group"
    configured_source_basis: str = "investment_default"
    observed_at: datetime | None = None
    last_success_at: datetime | None = None
    last_attempt_at: datetime | None = None
    last_attempt_status: str | None = None
    is_stale: bool
    fallback_reason: str | None
    conflicts: list[str]
    holdings_count: int
    market_value: Decimal


class SourceCoverageCounts(BaseModel):
    raw: int
    selected: int
    excluded: int
    confirmed: int
    hidden: int
    conflicted: int
    stale: int


class SelectedInvestmentsResponse(BaseModel):
    as_of_date: date
    banksalad_snapshot_date: date | None
    investment_total: Decimal
    investment_total_complete: bool = True
    confirmed_net_worth: Decimal | None
    estimated_net_worth: Decimal | None
    mixed_dates: bool
    warnings: list[str]
    accounts: list[SourceAccountStatus]
    coverage: SourceCoverageCounts
    items: list[SourceHolding]
    total_basis: str = "selected_current_estimate_with_source_dates"


class SourcePolicyPreviewResponse(BaseModel):
    policy: SourcePolicy
    current: SelectedInvestmentsResponse
    proposed: SelectedInvestmentsResponse
    net_worth_delta: Decimal | None
    preview_token: str
    historical_snapshots_mutated: Literal[False] = False


class AssetComponentKey(StrictModel):
    side: Literal["asset"] = "asset"
    category: str = Field(min_length=1, max_length=50)
    product_name: str = Field(min_length=1, max_length=200)


class SourceMappingRequest(StrictModel):
    account_key: str = Field(min_length=1, max_length=180)
    external_account_key: str = Field(min_length=1, max_length=180)
    asset_components: list[AssetComponentKey] = Field(
        default_factory=list, max_length=30
    )
    cash_scope: Literal["holdings_only", "holdings_and_cash", "unknown"] = "unknown"
    confirmed: Literal[True]
    reason: str = Field(min_length=1, max_length=500)


class SourceMappingResponse(SourceMappingRequest):
    id: int


class ExternalHoldingInput(StrictModel):
    instrument_key: str = Field(min_length=1, max_length=180)
    product_name: str = Field(min_length=1, max_length=200)
    market_value: Decimal = Field(ge=0, allow_inf_nan=False)
    currency: Literal["KRW"] = "KRW"
    native_currency: Literal["KRW", "USD"] | None = None
    native_market_value: Decimal | None = Field(default=None, ge=0, allow_inf_nan=False)
    native_cost_basis: Decimal | None = Field(default=None, ge=0, allow_inf_nan=False)
    quantity: Decimal | None = Field(default=None, ge=0, allow_inf_nan=False)
    unit_price: Decimal | None = Field(default=None, ge=0, allow_inf_nan=False)
    exchange_rate: Decimal | None = Field(default=None, gt=0, allow_inf_nan=False)


class ExternalRunInput(StrictModel):
    account_key: str = Field(min_length=1, max_length=180)
    valuation_at: datetime
    observed_at: datetime | None = None
    status: Literal[
        "pending", "success_complete", "success_partial", "failed", "rejected"
    ]
    holdings: list[ExternalHoldingInput]
    cash_balance: Decimal | None = Field(default=None, ge=0, allow_inf_nan=False)
    cash_included: bool = False
    error: str | None = None
    provenance: dict = Field(default_factory=dict)

    @model_validator(mode="after")
    def validate_complete(self):
        if self.valuation_at.tzinfo is None:
            raise ValueError("valuation_at requires timezone")
        if len({h.instrument_key for h in self.holdings}) != len(self.holdings):
            raise ValueError("duplicate instrument identity")
        if self.cash_included and self.cash_balance is None:
            raise ValueError("cash-inclusive run requires cash balance, including zero")
        return self
