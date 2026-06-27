from datetime import date, datetime, time
from typing import Literal

from pydantic import BaseModel, Field, model_validator

from app.schemas.common import PaginatedResponse


InstallmentPlanStatus = Literal["active", "completed", "cancelled"]
InstallmentForecastStatus = Literal["observed", "projected", "missed"]
InstallmentLinkStateFilter = Literal["all", "linked", "unlinked"]
InstallmentSuggestionConfidence = Literal["high", "medium", "low"]
InstallmentSuggestionConflictReason = Literal["installment_number_already_linked"]


class InstallmentPlanCreateRequest(BaseModel):
    display_name: str = Field(min_length=1, max_length=200)
    merchant: str = Field(min_length=1, max_length=500)
    payment_method: str | None = Field(default=None, max_length=100)
    total_installments: int = Field(ge=1, le=120)
    monthly_amount: int = Field(gt=0)
    first_payment_date: date
    status: InstallmentPlanStatus = "active"
    memo: str | None = Field(default=None, max_length=1000)


class InstallmentPlanPatchRequest(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=200)
    merchant: str | None = Field(default=None, min_length=1, max_length=500)
    payment_method: str | None = Field(default=None, max_length=100)
    total_installments: int | None = Field(default=None, ge=1, le=120)
    monthly_amount: int | None = Field(default=None, gt=0)
    first_payment_date: date | None = None
    status: InstallmentPlanStatus | None = None
    memo: str | None = Field(default=None, max_length=1000)

    @model_validator(mode="after")
    def validate_non_empty_patch(self) -> "InstallmentPlanPatchRequest":
        if not self.model_fields_set:
            raise ValueError("at least one field must be provided")
        return self


class InstallmentPlanResponse(BaseModel):
    id: int
    display_name: str
    merchant: str
    payment_method: str | None
    total_installments: int
    monthly_amount: int
    first_payment_date: date
    status: InstallmentPlanStatus
    memo: str | None
    linked_installment_count: int
    created_at: datetime
    updated_at: datetime


class InstallmentPlanListResponse(BaseModel):
    items: list[InstallmentPlanResponse]


class InstallmentTransactionLinkUpsertRequest(BaseModel):
    installment_plan_id: int
    installment_number: int = Field(ge=1)
    memo: str | None = Field(default=None, max_length=1000)


class InstallmentTransactionLinkBulkUpsertRequest(BaseModel):
    transaction_ids: list[int] = Field(min_length=1)
    installment_plan_id: int
    start_installment_number: int = Field(ge=1)
    memo: str | None = Field(default=None, max_length=1000)


class InstallmentTransactionLinkBulkUpsertResponse(BaseModel):
    updated: int


class InstallmentTransactionLinkItem(BaseModel):
    transaction_id: int
    installment_plan_id: int
    installment_plan_display_name: str
    installment_number: int
    total_installments: int
    monthly_amount: int
    due_date: date
    source: Literal["manual", "auto"]
    memo: str | None
    created_at: datetime
    updated_at: datetime


class InstallmentTransactionMappingItem(BaseModel):
    transaction_id: int
    date: date
    time: time
    type: str
    effective_category_major: str
    effective_category_minor: str | None
    description: str
    merchant: str
    amount: int
    currency: str
    payment_method: str | None
    memo: str | None
    recurring_payment_kind: str | None
    link: InstallmentTransactionLinkItem | None


class InstallmentTransactionMappingListResponse(PaginatedResponse):
    items: list[InstallmentTransactionMappingItem]


class InstallmentSuggestionTransactionItem(BaseModel):
    transaction_id: int
    date: date
    time: time
    type: str
    effective_category_major: str
    effective_category_minor: str | None
    description: str
    merchant: str
    amount: int
    currency: str
    payment_method: str | None
    memo: str | None
    recurring_payment_kind: str | None


class InstallmentTransactionSuggestionItem(BaseModel):
    transaction: InstallmentSuggestionTransactionItem
    installment_plan_id: int
    installment_plan_display_name: str
    installment_plan_merchant: str
    total_installments: int
    monthly_amount: int
    first_payment_date: date
    suggested_installment_number: int
    expected_billing_date: date
    amount_delta: int
    billing_day_delta: int
    score: int
    confidence: InstallmentSuggestionConfidence
    reason_labels: list[str]
    conflict_reason: InstallmentSuggestionConflictReason | None
    is_usable: bool


class InstallmentTransactionSuggestionListResponse(PaginatedResponse):
    items: list[InstallmentTransactionSuggestionItem]


class TransactionInstallmentLinkResponse(BaseModel):
    link: InstallmentTransactionLinkItem | None


class InstallmentForecastItem(BaseModel):
    installment_plan_id: int
    installment_plan_display_name: str
    installment_number: int
    total_installments: int
    due_date: date
    period: str
    amount: int
    status: InstallmentForecastStatus
    transaction_id: int | None


class InstallmentForecastMonthlySummaryItem(BaseModel):
    period: str
    observed_total: int
    projected_total: int
    missed_total: int


class InstallmentForecastResponse(BaseModel):
    items: list[InstallmentForecastItem]
    monthly_summary: list[InstallmentForecastMonthlySummaryItem]
