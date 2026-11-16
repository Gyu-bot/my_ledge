from datetime import date, datetime, time
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.common import PaginatedResponse


AxisSource = Literal[
    "transaction",
    "commitment",
    "category_default",
    "loan_link",
    "installment_link",
    "none",
    "not_applicable",
    "not_effective",
]
FlowRowSource = Literal["own_line", "refund_allocated_to_purchase", "no_flow_line"]


class TransactionAxes(BaseModel):
    """Resolved two-axis nature and monthly-flow row (T056), from the views.

    Read from vw_transaction_nature and vw_metric_flow_lines; never re-derived.
    Sources: transaction (set on the transaction, including putting it in a
    bundle), commitment (a recurring bundle's rule or attribute),
    category_default, loan_link / installment_link, none (nothing set:
    ad_hoc or undecided), not_applicable (수입·이체 등), not_effective
    (deleted / merged / superseded rows are outside the metric views).
    """

    payment_form: str | None = Field(
        default=None, description="committed / ad_hoc / not_applicable."
    )
    payment_form_source: AxisSource | None = None
    commitment_kind: str | None = Field(
        default=None, description="loan / installment / recurring (약정일 때)."
    )
    adjustability: str | None = Field(
        default=None,
        description="protected / adjustable / undecided / not_applicable.",
    )
    adjustability_source: AxisSource | None = None
    flow_row: str | None = Field(
        default=None,
        description=(
            "월 흐름표 줄. 자기 줄이 있으면 그 줄, 전부 구매에 배분된 환불이면 구매의 줄."
        ),
    )
    flow_rows: list[str] = Field(
        default_factory=list,
        description="이 거래의 모든 흐름 줄(환불 일부가 다른 구매에 배분되면 둘 이상).",
    )
    flow_row_source: FlowRowSource | None = Field(
        default=None,
        description=(
            "own_line: 거래 자신의 분류. refund_allocated_to_purchase: 확정 정산으로 "
            "구매에 배분된 환불이라 구매의 분류. no_flow_line: 유효 KRW 거래가 아님."
        ),
    )


class TransactionRecord(BaseModel):
    id: int
    date: date
    time: time
    type: str
    category_major: str
    category_minor: str | None
    category_major_user: str | None
    category_minor_user: str | None
    effective_category_major: str
    effective_category_minor: str | None
    description: str
    merchant: str
    amount: int
    currency: str
    payment_method: str | None
    cost_kind: str | None
    fixed_cost_necessity: str | None
    spend_necessity: str | None
    cost_classification_source: str | None
    recurring_payment_kind: str | None
    memo: str | None
    is_deleted: bool
    merged_into_id: int | None
    is_edited: bool
    source: str
    created_at: datetime
    updated_at: datetime


class TransactionResponse(TransactionAxes, TransactionRecord):
    """Stored transaction fields first, then the resolved axes (T056)."""


class TransactionListResponse(PaginatedResponse):
    items: list[TransactionResponse]


class TransactionFilterOptionsResponse(BaseModel):
    category_options: list[str]
    category_minor_options: list[str]
    category_minor_options_by_major: dict[str, list[str]]
    payment_method_options: list[str]


class TransactionSummaryItem(BaseModel):
    period: str
    amount: int


class TransactionSummaryBasis(BaseModel):
    aggregation_surface: str
    amount_sign_convention: str
    included_types: list[str]
    excluded_types: list[str]
    includes_loan_repayments: bool
    excludes_deleted: bool
    excludes_merged: bool
    canonical_cashflow_equivalent: bool


class TransactionSummaryResponse(BaseModel):
    basis: TransactionSummaryBasis
    items: list[TransactionSummaryItem]


class CategorySummaryItem(BaseModel):
    category: str
    amount: int


class CategorySummaryResponse(BaseModel):
    items: list[CategorySummaryItem]


class CategoryTimelineItem(BaseModel):
    period: str
    category: str
    amount: int


class CategoryTimelineResponse(BaseModel):
    items: list[CategoryTimelineItem]


class PaymentMethodSummaryItem(BaseModel):
    payment_method: str | None
    amount: int


class PaymentMethodSummaryResponse(BaseModel):
    items: list[PaymentMethodSummaryItem]


class TransactionCreateRequest(BaseModel):
    date: date
    time: time
    type: str
    category_major: str
    category_minor: str | None = None
    description: str
    merchant: str | None = None
    amount: int
    payment_method: str | None = None
    cost_kind: Literal["fixed", "variable"] | None = None
    fixed_cost_necessity: Literal["essential", "discretionary"] | None = None
    spend_necessity: Literal["essential", "discretionary"] | None = None
    recurring_payment_kind: (
        Literal[
            "installment",
            "monthly_recurring",
            "not_recurring",
        ]
        | None
    ) = None
    memo: str | None = None


class TransactionUpdateRequest(BaseModel):
    category_major_user: str | None = None
    category_minor_user: str | None = None
    merchant: str | None = None
    cost_kind: Literal["fixed", "variable"] | None = None
    fixed_cost_necessity: Literal["essential", "discretionary"] | None = None
    spend_necessity: Literal["essential", "discretionary"] | None = None
    recurring_payment_kind: (
        Literal[
            "installment",
            "monthly_recurring",
            "not_recurring",
        ]
        | None
    ) = None
    memo: str | None = None


class TransactionBulkUpdateRequest(BaseModel):
    ids: list[int] = Field(min_length=1)
    merchant: str | None = None
    category_major_user: str | None = None
    category_minor_user: str | None = None
    cost_kind: Literal["fixed", "variable"] | None = None
    fixed_cost_necessity: Literal["essential", "discretionary"] | None = None
    spend_necessity: Literal["essential", "discretionary"] | None = None
    recurring_payment_kind: (
        Literal[
            "installment",
            "monthly_recurring",
            "not_recurring",
        ]
        | None
    ) = None
    memo: str | None = None


class TransactionBulkUpdateResponse(BaseModel):
    updated: int


class TransactionBulkMutationRequest(BaseModel):
    ids: list[int] = Field(min_length=1)


class TransactionBulkMutationPreview(BaseModel):
    count: int
    period_start: date | None
    period_end: date | None
    expense_total: int
    representative_merchants: list[str]


class TransactionBulkMutationResponse(BaseModel):
    updated: int
    preview: TransactionBulkMutationPreview


class MergeTargetRequest(BaseModel):
    date: date
    time: time
    type: str
    category_major: str
    category_minor: str | None = None
    description: str
    amount: int
    payment_method: str | None = None


class TransactionMergeRequest(BaseModel):
    source_ids: list[int] = Field(min_length=1)
    target: MergeTargetRequest


TransactionGroupBy = Literal["month", "week", "day"]
TransactionTypeFilter = Literal["지출", "수입", "이체", "income_expense", "all"]
TransactionSourceFilter = Literal["import", "manual", "all"]
TransactionCategoryLevel = Literal["major", "minor"]
TransactionEditedFilter = Literal["true", "false", "all"]
TransactionCostKindFilter = Literal["fixed", "variable", "all"]
TransactionFixedCostNecessityFilter = Literal["essential", "discretionary", "all"]
TransactionSpendNecessityFilter = Literal["essential", "discretionary", "all"]
TransactionRecurringPaymentKindFilter = Literal[
    "installment",
    "monthly_recurring",
    "not_recurring",
    "all",
]
# Monthly-flow line filters (T059): values exactly as vw_metric_flow_lines
# stores them. A transaction matches when one of its flow lines matches every
# given value; nothing is re-derived in Python.
TransactionFlowRowFilter = Literal[
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
TransactionPaymentFormFilter = Literal["committed", "ad_hoc", "not_applicable"]
TransactionAdjustabilityFilter = Literal[
    "protected", "adjustable", "undecided", "not_applicable"
]
