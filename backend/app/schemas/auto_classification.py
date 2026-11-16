from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


LoanRepaymentType = Literal["principal", "interest", "mixed", "unknown"]
LoanMerchantMatchField = Literal["merchant", "description"]


class AutoClassificationSettingsResponse(BaseModel):
    apply_loan_rules_on_upload: bool


class AutoClassificationSettingsPatchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    apply_loan_rules_on_upload: bool | None = None


class LoanMerchantRuleRequest(BaseModel):
    merchant: str = Field(min_length=1, max_length=500)
    match_field: LoanMerchantMatchField = "merchant"
    loan_account_id: int
    repayment_type: LoanRepaymentType = "unknown"
    memo: str | None = None


class LoanMerchantRuleResponse(BaseModel):
    id: int
    merchant: str
    match_field: LoanMerchantMatchField
    loan_account_id: int
    lender: str
    product_name: str
    display_name: str
    repayment_type: LoanRepaymentType
    memo: str | None
    created_at: datetime
    updated_at: datetime


class LoanMerchantRuleListResponse(BaseModel):
    items: list[LoanMerchantRuleResponse]


class MerchantAliasRuleRequest(BaseModel):
    alias_pattern: str = Field(min_length=1, max_length=500)
    normalized_merchant: str = Field(min_length=1, max_length=500)


class MerchantAliasRuleResponse(BaseModel):
    id: int
    alias_pattern: str
    normalized_merchant: str
    created_at: datetime
    updated_at: datetime


class MerchantAliasRuleListResponse(BaseModel):
    items: list[MerchantAliasRuleResponse]


class AutoClassificationApplyResponse(BaseModel):
    updated: int
