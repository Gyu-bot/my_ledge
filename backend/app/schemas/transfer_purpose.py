"""Request/response contracts for the human-set transfer purpose (T061)."""

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field, model_validator

TransferPurposeValue = Literal["investment", "savings", "internal_move"]
ResolvedTransferPurpose = Literal["investment", "savings", "internal_move", "undecided"]
TransferPurposeSource = Literal["transaction", "rule_merchant", "rule_category", "none"]
TransferRuleScope = Literal["merchant", "category"]


class TransferPurposeRequest(BaseModel):
    purpose: TransferPurposeValue = Field(
        description=(
            "investment: to/from a holding in the investments snapshot; savings: "
            "to/from a savings deposit that is not an investments row; "
            "internal_move: any other move between own accounts."
        )
    )


class _RuleFields(BaseModel):
    merchant: str | None = Field(default=None, max_length=500)
    category_major: str | None = Field(default=None, max_length=50)
    category_minor: str | None = Field(
        default=None,
        max_length=50,
        description="Category scope only. Null covers the whole major category.",
    )
    label: str | None = Field(default=None, max_length=200)
    memo: str | None = Field(default=None, max_length=2000)


def check_rule_scope(
    scope: str,
    merchant: str | None,
    category_major: str | None,
    category_minor: str | None,
) -> None:
    if scope == "merchant":
        if not (merchant or "").strip():
            raise ValueError("merchant is required for match_scope=merchant")
        if category_major is not None or category_minor is not None:
            raise ValueError(
                "category fields are only allowed for match_scope=category"
            )
    else:
        if not (category_major or "").strip():
            raise ValueError("category_major is required for match_scope=category")
        if merchant is not None:
            raise ValueError("merchant is only allowed for match_scope=merchant")


class TransferPurposeRuleCreateRequest(_RuleFields):
    match_scope: TransferRuleScope
    purpose: TransferPurposeValue

    @model_validator(mode="after")
    def _check(self) -> "TransferPurposeRuleCreateRequest":
        check_rule_scope(
            self.match_scope, self.merchant, self.category_major, self.category_minor
        )
        return self


class TransferPurposeRuleUpdateRequest(_RuleFields):
    """Partial update; fields present change, ``null`` clears an optional one."""

    match_scope: TransferRuleScope | None = None
    purpose: TransferPurposeValue | None = None


class TransferPurposeRuleResponse(BaseModel):
    id: int
    match_scope: TransferRuleScope
    merchant: str | None
    category_major: str | None
    category_minor: str | None
    purpose: TransferPurposeValue
    label: str | None
    memo: str | None
    matched_transfer_count: int = Field(
        description="Effective 이체 whose resolved purpose currently comes from this rule."
    )
    created_at: datetime
    updated_at: datetime


class TransferPurposeRuleListResponse(BaseModel):
    items: list[TransferPurposeRuleResponse]


class TransferPurposeResponse(BaseModel):
    transaction_id: int
    effective: bool = Field(
        description="False for deleted/merged/superseded rows (purpose not resolved)."
    )
    date: date
    amount: int
    currency: str
    merchant: str
    description: str
    effective_category_major: str
    effective_category_minor: str | None
    purpose: ResolvedTransferPurpose | None
    purpose_source: TransferPurposeSource | None
    transaction_purpose: TransferPurposeValue | None
    rule_id: int | None
    rule_purpose: TransferPurposeValue | None


class TransferPurposeListResponse(BaseModel):
    total_count: int
    undecided_count: int
    undecided_activity_total: int = Field(
        description="Sum of |amount| of undecided effective KRW 이체 in the filter range."
    )
    activity_total: int = Field(
        description="Sum of |amount| of all effective KRW 이체 in the filter range."
    )
    items: list[TransferPurposeResponse]
