from datetime import date, datetime, time
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field, model_validator


RepaymentType = Literal["principal", "interest", "mixed", "unknown"]
LoanKind = Literal[
    "unknown",
    "overdraft",
    "equal_principal_interest",
    "equal_principal",
    "bullet",
    "other",
]
LoanLinkStateFilter = Literal["all", "linked", "unlinked"]


class LoanAccountCandidateResponse(BaseModel):
    loan_account_id: int | None
    lender: str
    product_name: str
    display_name_user: str | None = None
    display_name: str
    loan_kind: LoanKind = "unknown"
    loan_start_date: date | None
    loan_maturity_date: date | None
    as_of_date: date | None = None
    latest_snapshot_date: date | None
    is_active: bool = False
    is_hidden: bool = False
    is_matured: bool = False
    is_stale: bool = False
    lifecycle_status: str = "no_snapshot"
    latest_balance: Decimal | None
    last_observed_balance: Decimal | None = None
    last_observed_principal: Decimal | None = None
    last_observed_snapshot_date: date | None = None
    included_in_active_summary: bool = False
    excluded_from_summary_reason: str | None = None
    stable_identity_status: str = "stable_lender_product"
    stable_identity_reason: str | None = None
    latest_interest_rate: Decimal | None


class LoanAccountsResponse(BaseModel):
    items: list[LoanAccountCandidateResponse]


class LoanAccountMetadataUpdateRequest(BaseModel):
    loan_account_id: int | None = None
    lender: str | None = None
    product_name: str | None = None
    display_name_user: str | None = Field(default=None, max_length=200)
    loan_kind: LoanKind | None = None
    is_hidden: bool | None = None

    @model_validator(mode="after")
    def validate_account_target(self) -> "LoanAccountMetadataUpdateRequest":
        has_account_id = self.loan_account_id is not None
        has_lender_product = bool(self.lender and self.product_name)
        if not has_account_id and not has_lender_product:
            raise ValueError("loan_account_id or lender/product_name is required")
        if has_account_id and (self.lender or self.product_name):
            raise ValueError("use either loan_account_id or lender/product_name")
        return self


class LoanTransactionLinkUpsertRequest(BaseModel):
    loan_account_id: int | None = None
    lender: str | None = None
    product_name: str | None = None
    repayment_type: RepaymentType = "unknown"
    memo: str | None = Field(default=None, max_length=1000)

    @model_validator(mode="after")
    def validate_account_target(self) -> "LoanTransactionLinkUpsertRequest":
        has_account_id = self.loan_account_id is not None
        has_lender_product = bool(self.lender and self.product_name)
        if not has_account_id and not has_lender_product:
            raise ValueError("loan_account_id or lender/product_name is required")
        if has_account_id and (self.lender or self.product_name):
            raise ValueError("use either loan_account_id or lender/product_name")
        return self


class LoanTransactionLinkBulkUpsertRequest(LoanTransactionLinkUpsertRequest):
    transaction_ids: list[int] = Field(min_length=1)


class LoanTransactionLinkBulkUpsertResponse(BaseModel):
    updated: int


class LoanTransactionLinkItem(BaseModel):
    transaction_id: int
    loan_account_id: int
    lender: str
    product_name: str
    display_name_user: str | None = None
    display_name: str
    loan_kind: LoanKind = "unknown"
    repayment_type: RepaymentType
    source: Literal["manual", "auto"]
    memo: str | None
    created_at: datetime
    updated_at: datetime


class TransactionLoanLinkResponse(BaseModel):
    link: LoanTransactionLinkItem | None


class LoanTransactionMappingItem(BaseModel):
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
    link: LoanTransactionLinkItem | None


class LoanTransactionMappingListResponse(BaseModel):
    total: int
    page: int
    per_page: int
    items: list[LoanTransactionMappingItem]
