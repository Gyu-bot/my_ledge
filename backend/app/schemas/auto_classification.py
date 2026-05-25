from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, model_validator


CostKind = Literal["fixed", "variable"]
FixedCostNecessity = Literal["essential", "discretionary"]
LoanRepaymentType = Literal["principal", "interest", "mixed", "unknown"]


class AutoClassificationSettingsResponse(BaseModel):
    apply_cost_rules_on_upload: bool
    apply_loan_rules_on_upload: bool


class AutoClassificationSettingsPatchRequest(BaseModel):
    apply_cost_rules_on_upload: bool | None = None
    apply_loan_rules_on_upload: bool | None = None


class CategoryClassificationRuleRequest(BaseModel):
    category_major: str = Field(min_length=1, max_length=50)
    category_minor: str | None = Field(default=None, max_length=50)
    cost_kind: CostKind
    fixed_cost_necessity: FixedCostNecessity | None = None

    @model_validator(mode="after")
    def validate_necessity(self) -> "CategoryClassificationRuleRequest":
        if self.cost_kind == "variable" and self.fixed_cost_necessity is not None:
            raise ValueError("fixed_cost_necessity is only allowed for fixed cost rules")
        return self


class CategoryClassificationRuleResponse(BaseModel):
    id: int
    category_major: str
    category_minor: str | None
    cost_kind: CostKind
    fixed_cost_necessity: FixedCostNecessity | None
    created_at: datetime
    updated_at: datetime


class CategoryClassificationRuleListResponse(BaseModel):
    items: list[CategoryClassificationRuleResponse]


class LoanMerchantRuleRequest(BaseModel):
    merchant: str = Field(min_length=1, max_length=500)
    loan_account_id: int
    repayment_type: LoanRepaymentType = "unknown"
    memo: str | None = None


class LoanMerchantRuleResponse(BaseModel):
    id: int
    merchant: str
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


class AutoClassificationApplyResponse(BaseModel):
    updated: int
