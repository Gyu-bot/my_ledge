"""Request/response contracts for the two-axis nature API (T056)."""

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field, model_validator

AdjustabilityValue = Literal["protected", "adjustable"]
ResolvedAdjustability = Literal[
    "protected", "adjustable", "undecided", "not_applicable"
]
AdjustabilitySource = Literal[
    "fixed_loan",
    "fixed_installment",
    "transaction",
    "commitment",
    "category_default",
    "none",
    "not_applicable",
]
PaymentForm = Literal["committed", "ad_hoc", "not_applicable"]
CommitmentKind = Literal["loan", "installment", "recurring"]
CommitmentScope = Literal["merchant", "category"]
CommitmentCycle = Literal["monthly", "yearly", "n_times"]
CommitmentAmountKind = Literal["fixed", "variable"]
NatureOrigin = Literal["migration", "user", "legacy_edit"]


class CategoryAdjustabilityDefaultRequest(BaseModel):
    category_major: str = Field(min_length=1, max_length=50)
    category_minor: str | None = Field(
        default=None,
        max_length=50,
        description="Null sets the default for the whole major category.",
    )
    adjustability: AdjustabilityValue


class CategoryAdjustabilityDefaultResponse(BaseModel):
    id: int
    category_major: str
    category_minor: str | None
    adjustability: AdjustabilityValue
    created_at: datetime
    updated_at: datetime


class CategoryAdjustabilityDefaultListResponse(BaseModel):
    items: list[CategoryAdjustabilityDefaultResponse]


class _CommitmentAttributes(BaseModel):
    label: str | None = Field(default=None, max_length=200)
    cycle: CommitmentCycle | None = Field(
        default=None, description="Null means the cycle is not recorded yet (미정)."
    )
    total_count: int | None = Field(
        default=None, ge=1, description="Number of payments; only for cycle=n_times."
    )
    amount_kind: CommitmentAmountKind | None = Field(
        default=None, description="fixed or variable amount; null = 미정."
    )
    adjustability: AdjustabilityValue | None = Field(
        default=None, description="Commitment-level adjustability; null = 미정."
    )
    start_date: date | None = None
    end_date: date | None = None
    memo: str | None = Field(default=None, max_length=2000)


def _check_cycle_and_dates(
    cycle: str | None,
    total_count: int | None,
    start_date: date | None,
    end_date: date | None,
) -> None:
    if cycle == "n_times" and total_count is None:
        raise ValueError("total_count is required for cycle=n_times")
    if cycle != "n_times" and total_count is not None:
        raise ValueError("total_count is only allowed for cycle=n_times")
    if start_date is not None and end_date is not None and end_date < start_date:
        raise ValueError("end_date must not be before start_date")


class RecurringCommitmentCreateRequest(_CommitmentAttributes):
    match_scope: CommitmentScope
    merchant: str | None = Field(default=None, max_length=500)
    category_major: str = Field(min_length=1, max_length=50)
    category_minor: str | None = Field(default=None, max_length=50)

    @model_validator(mode="after")
    def validate_shape(self) -> "RecurringCommitmentCreateRequest":
        if self.match_scope == "merchant" and not (self.merchant or "").strip():
            raise ValueError("merchant is required for match_scope=merchant")
        if self.match_scope == "category" and self.merchant is not None:
            raise ValueError("merchant must be null for match_scope=category")
        _check_cycle_and_dates(
            self.cycle, self.total_count, self.start_date, self.end_date
        )
        return self


class RecurringCommitmentUpdateRequest(BaseModel):
    """Partial update. Only fields present in the body change; null clears."""

    label: str | None = Field(default=None, max_length=200)
    match_scope: CommitmentScope | None = None
    merchant: str | None = Field(default=None, max_length=500)
    category_major: str | None = Field(default=None, min_length=1, max_length=50)
    category_minor: str | None = Field(default=None, max_length=50)
    cycle: CommitmentCycle | None = None
    total_count: int | None = Field(default=None, ge=1)
    amount_kind: CommitmentAmountKind | None = None
    adjustability: AdjustabilityValue | None = None
    start_date: date | None = None
    end_date: date | None = None
    memo: str | None = Field(default=None, max_length=2000)


class RecurringCommitmentEndRequest(BaseModel):
    end_date: date


class RecurringCommitmentResponse(BaseModel):
    id: int
    label: str | None
    match_scope: CommitmentScope
    merchant: str | None
    category_major: str
    category_minor: str | None
    cycle: CommitmentCycle | None
    total_count: int | None
    amount_kind: CommitmentAmountKind | None
    adjustability: AdjustabilityValue | None
    start_date: date | None
    end_date: date | None
    origin: NatureOrigin
    memo: str | None
    member_transaction_count: int = Field(
        description="Effective transactions currently resolved to this commitment."
    )
    first_member_date: date | None
    last_member_date: date | None
    created_at: datetime
    updated_at: datetime


class RecurringCommitmentListResponse(BaseModel):
    items: list[RecurringCommitmentResponse]


class TransactionAdjustabilityRequest(BaseModel):
    adjustability: AdjustabilityValue


class NatureLevels(BaseModel):
    fixed: AdjustabilityValue | None = Field(
        description="protected while a loan or installment link exists."
    )
    transaction: AdjustabilityValue | None
    commitment: AdjustabilityValue | None
    category_default: AdjustabilityValue | None


class NatureCommitmentRef(BaseModel):
    id: int
    match: Literal["rule", "explicit"]
    label: str | None
    match_scope: CommitmentScope
    merchant: str | None
    category_major: str
    category_minor: str | None
    cycle: CommitmentCycle | None
    amount_kind: CommitmentAmountKind | None
    start_date: date | None
    end_date: date | None


class TransactionNatureResponse(BaseModel):
    transaction_id: int
    effective: bool = Field(
        description=(
            "False for deleted, merged, or superseded transactions; resolved "
            "axes are then null because metric views exclude them."
        )
    )
    type: str
    date: date
    merchant: str
    effective_category_major: str
    effective_category_minor: str | None
    payment_form: PaymentForm | None
    commitment_kind: CommitmentKind | None
    loan_account_id: int | None
    installment_plan_id: int | None
    commitment: NatureCommitmentRef | None
    adjustability: ResolvedAdjustability | None
    adjustability_source: AdjustabilitySource | None
    levels: NatureLevels
    excluded_from_commitments: bool
    installment_link_unconfirmed: bool
    necessity_conflict: bool
    override_source: NatureOrigin | None
    precedence: str = Field(
        default=(
            "지출 only: loan/installment link (fixed protected) > transaction > "
            "commitment > category_default > undecided. 수입·이체 are not_applicable."
        )
    )
