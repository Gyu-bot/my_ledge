from datetime import date
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator


Confidence = Literal["high", "medium", "low", "unavailable"]


def income_source_key(merchant: str) -> str:
    return "income:" + " ".join(merchant.lower().split())


class IncomeExpectation(BaseModel):
    source_key: str = Field(min_length=1, max_length=520)
    merchant: str = Field(min_length=1, max_length=500)
    expected_amount: int = Field(ge=0, le=1_000_000_000_000)
    expected_day: int = Field(ge=1, le=31)
    stopped: bool = False

    @field_validator("merchant")
    @classmethod
    def normalize_merchant(cls, value: str) -> str:
        value = " ".join(value.split())
        if not value:
            raise ValueError("merchant must not be blank")
        return value

    @model_validator(mode="after")
    def validate_identity(self) -> "IncomeExpectation":
        # Stable per normalized payer: renaming an expectation must not hijack
        # another detected source or cause duplicate forecasting for one payer.
        if self.source_key != income_source_key(self.merchant):
            raise ValueError("source_key must equal income: plus normalized merchant")
        return self


class IncomeExpectationsSettings(BaseModel):
    items: list[IncomeExpectation] = Field(default_factory=list, max_length=50)

    @model_validator(mode="after")
    def unique_sources(self) -> "IncomeExpectationsSettings":
        if len({item.source_key for item in self.items}) != len(self.items):
            raise ValueError("income sources must be unique")
        return self


class ProjectionCoverage(BaseModel):
    basis: str
    latest_upload_date: date | None = None
    first_observed_date: date | None = None
    last_observed_date: date | None = None
    adequately_covered_periods: list[str] = Field(default_factory=list)
    excluded_periods: list[str] = Field(default_factory=list)
    missing_periods: list[str] = Field(default_factory=list)


class IncomeProjectionSource(BaseModel):
    source_key: str
    merchant: str
    expected_amount: int
    observed_amount: int
    remaining_amount: int
    expected_date: date | None
    expected_day: int | None
    expected_date_from: date | None
    expected_date_to: date | None
    status: Literal["expected", "received", "partial", "late", "stopped", "uncertain"]
    confidence: Confidence
    history_periods: list[str] = Field(default_factory=list)
    excluded_periods: list[str] = Field(default_factory=list)
    matched_transaction_ids: list[int] = Field(default_factory=list)
    reason: str


class ExpenseProjectionComponent(BaseModel):
    kind: Literal["loan", "installment", "recurring", "variable"]
    expected_remaining: int | None
    known_expected_remaining: int = 0
    basis: str
    missing_reasons: list[str] = Field(default_factory=list)


class MonthlyProjection(BaseModel):
    period: str
    as_of_date: date
    observed_through: date | None
    observed_income: int
    expected_remaining_income: int
    projected_month_income: int
    observed_net_expense: int
    expected_remaining_expense: int | None
    known_expected_remaining_expense: int = 0
    net_after_known_remaining_expense: int = 0
    projected_month_expense: int | None
    observed_net_cashflow: int
    projected_month_end_net: int | None
    confidence: Confidence
    included_periods: list[str]
    excluded_periods: list[str]
    missing_reasons: list[str]
    limitations: list[str]
    income_sources: list[IncomeProjectionSource]
    expense_components: list[ExpenseProjectionComponent]
    coverage: ProjectionCoverage
