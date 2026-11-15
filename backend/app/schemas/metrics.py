"""Metric contract schemas (T054): definition, scope, as-of dates, 미정 share."""

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field

MonthStatus = Literal["closed", "in_progress"]
FlowSection = Literal["income", "committed", "ad_hoc", "undecided", "transfer", "other"]
FlowRowKey = Literal[
    "income_undetermined",
    "committed_loan",
    "committed_installment",
    "committed_recurring",
    "ad_hoc_protected",
    "ad_hoc_adjustable",
    "undecided",
    "transfer_undetermined",
    "other_type",
]
SpendCubeDimension = Literal[
    "period",
    "effective_category_major",
    "effective_category_minor",
    "merchant",
    "payment_form",
    "commitment_kind",
    "adjustability",
    "flow_row",
]


class SnapshotAsOf(BaseModel):
    """Latest snapshot date per kind. Kinds are never merged into one date."""

    assets: date | None = None
    loans: date | None = None
    investments: date | None = None
    insurance: date | None = None
    profile: date | None = None


class MetricAsOf(BaseModel):
    transaction_as_of: date | None = None
    transaction_as_of_basis: Literal["max_effective_transaction_date"] = (
        "max_effective_transaction_date"
    )
    first_transaction_date: date | None = None
    last_closed_period: str | None = Field(
        default=None,
        description="Latest month whose transaction data reaches the month's last day.",
    )
    in_progress_period: str | None = Field(
        default=None,
        description="Month of transaction_as_of when it is not the month's last day.",
    )
    snapshot_as_of: SnapshotAsOf = Field(default_factory=SnapshotAsOf)


class MetricInclusion(BaseModel):
    basis_view: str
    currency: str = "KRW"
    excluded: list[str] = Field(
        default_factory=lambda: [
            "is_deleted",
            "merged_into_id",
            "superseded",
            "non_krw_currency",
        ]
    )
    sign_convention: str
    refunds: str
    transfers: str
    loans: str
    period_attribution: str


class MetricContract(BaseModel):
    """Basis every aggregate response carries (Implentation-plan.md 2.7)."""

    definition: str
    scope: str
    inclusion: MetricInclusion
    as_of: MetricAsOf
    adjustability_undecided_total: int | None = Field(
        default=None,
        description="Net expense in scope whose 조정 가능성 is undecided (미정).",
    )
    adjustability_undecided_share: float | None = Field(
        default=None,
        description="adjustability_undecided_total / total_outflow; null when total_outflow <= 0.",
    )
    non_krw_transaction_count: int = 0
    field_scopes: dict[str, str] = Field(default_factory=dict)


class MonthlyFlowRow(BaseModel):
    section: FlowSection
    row: FlowRowKey
    amount: int = Field(
        description="Row direction: income/transfer as received (+), spend rows as paid (+), refunds reduce spend."
    )
    signed_amount: int = Field(description="Sum of source-signed amounts.")
    transaction_count: int


class MonthlyFlowMonth(BaseModel):
    period: str
    month_status: MonthStatus
    income_total: int
    committed_loan_total: int
    committed_installment_total: int
    committed_recurring_total: int
    committed_total: int
    ad_hoc_protected_total: int
    ad_hoc_adjustable_total: int
    undecided_total: int
    total_outflow: int
    living_spend: int
    adjustable_spend: int
    protected_spend: int
    adjustability_undecided_total: int
    adjustability_undecided_share: float | None
    residual: int
    residual_rate: float | None = Field(
        description="residual / income_total; closed months with positive income only."
    )
    transfer_net: int
    transfer_activity_total: int
    other_type_total: int
    refund_total: int
    signed_total: int
    transaction_count: int
    rows: list[MonthlyFlowRow]


class MonthlyFlowResponse(BaseModel):
    contract: MetricContract
    items: list[MonthlyFlowMonth]


class SpendCubeRow(BaseModel):
    period: str | None = None
    effective_category_major: str | None = None
    effective_category_minor: str | None = None
    merchant: str | None = None
    payment_form: str | None = None
    commitment_kind: str | None = None
    adjustability: str | None = None
    flow_row: str | None = None
    amount: int
    charge_total: int
    refund_total: int
    transaction_count: int = Field(
        description="Distinct transactions per cube cell, summed across merged cells."
    )


class SpendCubeResponse(BaseModel):
    contract: MetricContract
    group_by: list[SpendCubeDimension]
    total_amount: int
    rows: list[SpendCubeRow]


class ExcludedCurrencyItem(BaseModel):
    period: str
    currency: str
    type: str
    signed_amount: int
    transaction_count: int


class MetricDataStatusResponse(BaseModel):
    as_of: MetricAsOf
    closed_periods: list[str]
    in_progress_period: str | None
    adjustability_undecided_total: int
    adjustability_undecided_share: float | None
    total_outflow: int
    excluded_currency: list[ExcludedCurrencyItem]
    non_krw_transaction_count: int
