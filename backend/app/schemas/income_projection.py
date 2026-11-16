from datetime import date
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from app.schemas.metrics import MONTH_DATA_COVERAGE_RULE


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
    month_coverage_rule: str = Field(
        default=(
            MONTH_DATA_COVERAGE_RULE
            + " 월말 전망은 이 달력상 범위 규칙 위에 basis의 관측 밀도 규칙을 더해 "
            "'충분히 관측된 달'(adequately_covered_periods)만 가정에 쓴다."
        ),
        description="/read/data-status·비교 계약과 같은 달별 자료 범위 규칙.",
    )


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
    # T064 R7: deposits are grouped by pay cycle, not calendar month. A payer
    # whose deposits sit on the month boundary is anchored to the month end
    # (a deposit in the first days of a month belongs to the previous cycle)
    # or to the month start (a deposit in the last days belongs to the next).
    cycle_anchor: Literal["calendar_month", "month_end", "month_start"] = (
        "calendar_month"
    )
    cycle_reassigned_transaction_ids: list[int] = Field(default_factory=list)


class RecurringExpenseProjectionSource(BaseModel):
    source_key: str
    merchant: str
    expected_monthly_amount: int | None = Field(ge=0)
    observed_payment_amount: int = Field(ge=0)
    observed_refund_amount: int = Field(ge=0)
    observed_net_expense: int
    expected_remaining: int | None = Field(ge=0)
    additional_observed_amount: int = Field(ge=0)
    confidence: Confidence
    status: Literal["expected", "observed", "review"]
    basis: str
    history_periods: list[str] = Field(default_factory=list)
    excluded_periods: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    # T064 R6: one source per registered recurring commitment (T056 bundle).
    commitment_id: int | None = None
    cycle: Literal["monthly", "yearly", "n_times"] | None = None
    end_date: date | None = None
    # Loan component rows (one per loan added to the expense assumption).
    loan_account_id: int | None = None
    match_method: (
        Literal[
            "loan_link",
            "loan_merchant_rule_unconfirmed",
            "loan_link_and_merchant_rule",
            "no_repayment_this_month",
        ]
        | None
    ) = Field(
        default=None,
        description=(
            "대출 행만: 이번 달 상환을 어떻게 찾았나. loan_link(대출 계좌 연결), "
            "loan_merchant_rule_unconfirmed(사람이 등록한 대출 거래처 규칙, 연결 미확인), "
            "둘 다, 또는 이번 달 상환 없음."
        ),
    )
    recorded_monthly_payment_source: str | None = Field(
        default=None,
        description="대출 행만: 쓴 월 상환액의 출처(manual / estimated_from_linked_transactions).",
    )


class ProjectionCommitmentNotInExpense(BaseModel):
    """A registered commitment the expense assumption leaves out (T064 R1)."""

    kind: Literal["loan"] = "loan"
    name: str
    loan_account_id: int | None = None
    monthly_amount: int | None = None
    checked_periods: list[str] = Field(default_factory=list)
    reason_code: Literal["no_expense_line_in_recent_month", "no_loan_account"]
    reason: str


class AnnualExpenseAssumption(BaseModel):
    """Spending seen in only one or two of the last 12 months (T064 R4)."""

    category: str
    active_months_in_window: int
    last_year_period: str
    last_year_same_month_amount: int
    observed_this_month: int
    expected_remaining: int
    basis: str


class ProjectionTwelveMonthWindow(BaseModel):
    """The 12 closed months before the reference month (comparison contract)."""

    rule: str = (
        "12개월 창의 12개월이 모두 자료가 있는 달이고 자료 시작 뒤(월중 시작 첫 달 "
        "제외), 기준 구간 시작일 뒤일 때만 연간성(12개월 중 1–2개월에만 지출이 있는 "
        "카테고리)을 판정한다. 연간성 카테고리는 6개월 중앙값 기준선에서 빼고, 작년 "
        "같은 달의 남은 날짜 금액을 가정한다."
    )
    start_period: str
    end_period: str
    available: bool
    unavailable_reason: (
        Literal["no_data", "data_start", "baseline_start_date"] | None
    ) = None


class ExpenseProjectionComponent(BaseModel):
    kind: Literal["loan", "installment", "recurring", "variable"]
    expected_remaining: int | None
    known_expected_remaining: int = 0
    basis: str
    missing_reasons: list[str] = Field(default_factory=list)
    confidence: Confidence = "medium"
    warnings: list[str] = Field(default_factory=list)
    sources: list[RecurringExpenseProjectionSource] = Field(default_factory=list)
    # T064 R1/R2: this month's payments counted for a loan or installment plan
    # by a person-registered rule (loan merchant rule, installment plan rule)
    # without a link ("연결 미확인").
    link_unconfirmed_count: int = 0
    link_unconfirmed_amount: int = 0
    # T064 R1 (loan only): registered loans not added to the expense
    # assumption because they do not appear as expense lines in this ledger.
    not_in_expense_commitments: list[ProjectionCommitmentNotInExpense] = Field(
        default_factory=list
    )
    # T064 R4 (variable only).
    twelve_month_window: ProjectionTwelveMonthWindow | None = None
    annual_items: list[AnnualExpenseAssumption] = Field(default_factory=list)


class ProjectionAdjustabilityShare(BaseModel):
    """Adjustability of the remaining-period spending assumption (T064 R12)."""

    basis: str
    protected_amount: int = 0
    adjustable_amount: int = 0
    undecided_amount: int = 0
    total_amount: int = 0
    undecided_share_pct: float | None = None


class ProjectionAccuracyBand(BaseModel):
    band: Literal["day_01_10", "day_11_20", "day_21_31"]
    as_of_days: list[int]
    points: int
    withheld_points: int
    evaluated_points: int
    net_median_signed_error: int | None = None
    net_median_absolute_error: int | None = None
    net_median_signed_error_pct_of_income: float | None = None
    expense_median_signed_error: int | None = None


class ProjectionAccuracy(BaseModel):
    """Recent closed-month replay of this forecast (T064 R12)."""

    definition: str
    reference_period: str
    evaluated_periods: list[str] = Field(default_factory=list)
    as_of_days: list[int] = Field(default_factory=list)
    current_band: Literal["day_01_10", "day_11_20", "day_21_31"] | None = None
    bands: list[ProjectionAccuracyBand] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)


ProjectionCompletenessStatus = Literal[
    "all_known_components", "known_components_only", "not_projected"
]
PROJECTION_COMPLETENESS_LABELS: dict[str, str] = {
    "all_known_components": "알려진 구성 요소를 모두 반영한 전망",
    "known_components_only": "일부 구성 요소를 빼고 반영한 전망(전체 전망이 아님)",
    "not_projected": "월말 값을 내지 않음",
}


class ProjectionLeftOutComponent(BaseModel):
    component: Literal["income_source", "loan", "installment", "recurring", "variable"]
    key: str | None = Field(
        default=None, description="수입 출처 source_key, 대출 계좌 id 등."
    )
    name: str | None = None
    reason_code: str
    reason: str


class ProjectionCompleteness(BaseModel):
    """Whether projected_month_end_net covers every known component."""

    status: ProjectionCompletenessStatus
    status_label: str
    full_projection_available: bool = Field(
        default=False,
        description=(
            "projected_month_end_net이 알려진 구성 요소를 모두 반영했을 때만 true. "
            "false인데 값이 있으면 그 값은 일부 구성 요소만의 합이다."
        ),
    )
    amount_scope: Literal["all_known_components", "known_components", "none"] = Field(
        default="none",
        description=(
            "projected_month_end_net과 net_after_known_remaining_expense가 덮는 범위. "
            "known_components면 left_out의 항목이 빠진 부분 합계, none이면 값이 없다."
        ),
    )
    left_out: list[ProjectionLeftOutComponent] = Field(default_factory=list)
    basis: str = (
        "projected_month_end_net만 읽으면 빠진 구성 요소를 알 수 없다. 남은 금액을 0으로 "
        "둔 수입 출처(확인 필요 uncertain, 규칙으로 자동 중단 stopped), 지출 가정에 넣지 "
        "않은 대출, 추정하지 못한 지출 구성 요소를 left_out에 나열한다. left_out이 "
        "있으면 known_components_only, 월말 값이 없으면 not_projected. 월말을 넘는 "
        "전망은 하지 않는다."
    )


class MonthlyProjection(BaseModel):
    period: str
    as_of_date: date
    observed_through: date | None
    # First day the remaining-period assumptions cover: the day after the later
    # of the last observed transaction and the latest upload snapshot in this
    # month (T064 R10). None when the whole month is already covered.
    remaining_period_start: date | None = None
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
    warnings: list[str] = Field(default_factory=list)
    limitations: list[str]
    income_sources: list[IncomeProjectionSource]
    expense_components: list[ExpenseProjectionComponent]
    coverage: ProjectionCoverage
    # T064 R11: how as_of_date was chosen. "requested_date" when the caller
    # passed it, "transaction_as_of" when the dashboard used the transaction
    # as-of date (plan 2.1 in-progress month), "today_no_data" without data.
    as_of_basis: Literal["requested_date", "transaction_as_of", "today_no_data"] = (
        "requested_date"
    )
    # T064 R12: adjustability of the (known) remaining spending assumption.
    # The recent closed-month replay error is a separate read-only endpoint
    # (GET /canonical-views/month-projection/accuracy): replaying the forecast
    # 15 times is too slow for every dashboard request.
    remaining_expense_adjustability: ProjectionAdjustabilityShare | None = None
    completeness: ProjectionCompleteness | None = None
