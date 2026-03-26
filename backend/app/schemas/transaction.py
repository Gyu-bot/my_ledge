from datetime import date, datetime, time
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.common import PaginatedResponse


class TransactionResponse(BaseModel):
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
    amount: int
    currency: str
    payment_method: str | None
    cost_kind: str | None
    fixed_cost_necessity: str | None
    memo: str | None
    is_deleted: bool
    merged_into_id: int | None
    is_edited: bool
    source: str
    created_at: datetime
    updated_at: datetime


class TransactionListResponse(PaginatedResponse):
    items: list[TransactionResponse]


class TransactionSummaryItem(BaseModel):
    period: str
    amount: int


class TransactionSummaryResponse(BaseModel):
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
    amount: int
    payment_method: str | None = None
    cost_kind: str | None = None
    fixed_cost_necessity: str | None = None
    memo: str | None = None


class TransactionUpdateRequest(BaseModel):
    category_major_user: str | None = None
    category_minor_user: str | None = None
    cost_kind: str | None = None
    fixed_cost_necessity: str | None = None
    memo: str | None = None


class TransactionBulkUpdateRequest(BaseModel):
    ids: list[int] = Field(min_length=1)
    category_major_user: str | None = None
    category_minor_user: str | None = None
    cost_kind: str | None = None
    fixed_cost_necessity: str | None = None


class TransactionBulkUpdateResponse(BaseModel):
    updated: int


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
TransactionTypeFilter = Literal["지출", "수입", "이체", "all"]
TransactionCategoryLevel = Literal["major", "minor"]
TransactionEditedFilter = Literal["true", "false", "all"]
