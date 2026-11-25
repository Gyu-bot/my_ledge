"""재무상태 contracts (T061): net worth reconciliation and emergency fund months."""

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.metrics import MetricContract

ReconciliationStatus = Literal[
    "complete",
    "incomplete_classification",
    "transactions_not_covered",
    "snapshot_dates_mismatched",
    "incomplete_snapshot_values",
    "no_snapshot_pair",
]
SnapshotKind = Literal["loans", "investments"]
KindPairStatus = Literal["observed", "absent", "mismatched", "incomplete"]
SnapshotValueWithheldReason = Literal[
    "snapshot_value_missing", "snapshot_not_available"
]
KindChangeWithheldReason = Literal[
    "snapshot_dates_mismatched", "snapshot_value_missing"
]
ReconciliationWithheldReason = Literal[
    KindChangeWithheldReason, "transactions_not_covered"
]
EmergencyFundStatus = Literal[
    "complete", "incomplete_classification", "no_baseline", "no_asset_snapshot"
]


COMPLETE_STATUS_NOTE = (
    "status=complete는 대조 항목을 모두 계산할 수 있었다는 뜻이지 순자산 변화가 "
    "설명되었다는 뜻이 아니다. 설명되지 않은 차이의 크기는 unexplained_difference와 "
    "unexplained_share_of_change(설명되지 않은 차이 ÷ |순자산 변화|)로 읽는다."
)
UNEXPLAINED_SHARE_ZERO_CHANGE = "net_worth_change_zero"
UNEXPLAINED_SHARE_NOT_COMPUTABLE = "unexplained_not_computable"


class ReconciliationInterval(BaseModel):
    start_snapshot_date: date
    end_snapshot_date: date
    transaction_start_date: date = Field(
        description="First transaction date counted: the day after start_snapshot_date."
    )
    transaction_end_date: date = Field(
        description="Last transaction date counted: end_snapshot_date (inclusive)."
    )
    boundary_rule: str


class NetWorthPoint(BaseModel):
    snapshot_date: date
    asset_total: int
    liability_total: int
    net_worth: int
    negative_asset_excluded_total: int


class SnapshotKindPair(BaseModel):
    """One snapshot kind over the interval. Kinds keep their own dates."""

    kind: SnapshotKind
    pair_status: KindPairStatus = Field(
        description=(
            "observed: complete values on both interval dates. incomplete: both "
            "dates exist and at least one value is missing. absent: no rows of this kind "
            "in any snapshot (0 at both ends). mismatched: the kind's latest "
            "snapshot on or before an interval date is a different date."
        )
    )
    start_as_of: date | None = Field(
        description="Latest snapshot date of this kind on or before start_snapshot_date."
    )
    end_as_of: date | None = Field(
        description="Latest snapshot date of this kind on or before end_snapshot_date."
    )
    start_value: int | None
    end_value: int | None
    start_known_value_total: int | None = Field(
        default=None,
        description="Sum of known rows when the start total is incomplete, if any are known.",
    )
    end_known_value_total: int | None = Field(
        default=None,
        description="Sum of known rows when the end total is incomplete, if any are known.",
    )
    start_value_withheld_reason: SnapshotValueWithheldReason | None = None
    end_value_withheld_reason: SnapshotValueWithheldReason | None = None
    change: int | None = Field(description="end_value − start_value when comparable.")
    change_withheld_reason: KindChangeWithheldReason | None = None
    missing_value_row_count: int = Field(
        description="Empty values across the two reported as-of dates, counted once per row."
    )
    value_basis: str


class OtherKindAsOf(BaseModel):
    """Kinds the reconciliation does not use, reported so dates are never merged."""

    insurance_start_as_of: date | None
    insurance_end_as_of: date | None
    profile_start_as_of: date | None
    profile_end_as_of: date | None


class TransactionCoverage(BaseModel):
    covered: bool
    first_transaction_date: date | None
    transaction_as_of: date | None
    periods_without_data: list[str] = Field(
        description="Months intersecting the interval with no effective KRW transaction."
    )
    non_krw_transaction_count: int = Field(
        description="Effective non-KRW transactions in the interval (never summed)."
    )
    rule: str


class TransferBreakdown(BaseModel):
    """잔여의 행방 over the interval, signed (received +, paid −)."""

    transfer_net: int
    investment_net: int
    savings_net: int
    investment_savings_net: int = Field(
        description="투자·저축 이체 = investment_net + savings_net."
    )
    internal_move_net: int = Field(description="그 밖의 계좌 간 이동.")
    undecided_net: int
    activity_total: int = Field(description="Sum of |amount| of every transfer leg.")
    undecided_activity_total: int
    undecided_share: float | None = Field(
        description="undecided_activity_total ÷ activity_total; null without transfers."
    )
    netting_rule: str


class ReconciliationFlow(BaseModel):
    income_total: int
    total_outflow: int
    committed_loan_total: int
    residual: int
    adjustability_undecided_total: int
    transaction_count: int


class ReconciliationItems(BaseModel):
    """순자산 변화 = 잔여 + 대출 잔액 감소분 + 투자 평가 변동 + 설명되지 않은 차이."""

    net_worth_change: int
    residual: int | None
    loan_balance_decrease: int | None
    investment_valuation_change: int | None
    unexplained_difference: int | None = Field(
        description=(
            "net_worth_change − residual − loan_balance_decrease − "
            "investment_valuation_change, left as it is. Null only when an item "
            "cannot be computed (mismatched dates, missing values, or uncovered transactions)."
        )
    )
    investment_value_change: int | None = Field(
        description="investments end_value − start_value."
    )
    investment_net_transfer_in: int = Field(
        description="Money moved into investments by transfers = −investment_net."
    )
    withheld_reasons: dict[
        Literal[
            "loan_balance_decrease",
            "investment_value_change",
            "investment_valuation_change",
            "unexplained_difference",
        ],
        ReconciliationWithheldReason,
    ] = Field(default_factory=dict)
    unexplained_share_of_change: float | None = Field(
        default=None,
        description=(
            "unexplained_difference ÷ |net_worth_change|, 4 dp. Signed (sign of the "
            "unexplained difference) and may exceed 1 in magnitude. Withheld (null) "
            "when the change is 0 or the difference cannot be computed."
        ),
    )
    unexplained_share_withheld_reason: (
        Literal["net_worth_change_zero", "unexplained_not_computable"] | None
    ) = None
    investment_valuation_change_provisional: bool = Field(
        default=False,
        description=(
            "True when the valuation is available and transfers of undecided purpose exist: some of "
            "them may be investment deposits, so investment_valuation_change may move "
            "once a person sets their purpose."
        ),
    )
    investment_valuation_change_provisional_reason: str | None = None


class NetWorthReconciliationResponse(BaseModel):
    status: ReconciliationStatus
    status_reasons: list[str]
    identity: str = (
        "net_worth_change = residual + loan_balance_decrease + "
        "investment_valuation_change + unexplained_difference"
    )
    interval: ReconciliationInterval | None
    net_worth_start: NetWorthPoint | None
    net_worth_end: NetWorthPoint | None
    kinds: list[SnapshotKindPair]
    other_kinds: OtherKindAsOf | None
    transactions: TransactionCoverage | None
    flow: ReconciliationFlow | None
    transfers: TransferBreakdown | None
    items: ReconciliationItems | None
    contract: MetricContract
    status_note: str = COMPLETE_STATUS_NOTE


class SnapshotIntervalItem(BaseModel):
    start_snapshot_date: date
    end_snapshot_date: date
    status: ReconciliationStatus
    net_worth_change: int
    unexplained_difference: int | None
    unexplained_difference_withheld_reason: ReconciliationWithheldReason | None = None
    transfer_undecided_share: float | None
    unexplained_share_of_change: float | None = Field(
        default=None, description="Same as items.unexplained_share_of_change."
    )
    investment_valuation_change_provisional: bool = False


class SnapshotDatesByKind(BaseModel):
    """Every snapshot date per kind, newest first. Never merged into one list."""

    assets: list[date]
    loans: list[date]
    investments: list[date]
    insurance: list[date]
    profile: list[date]


class SnapshotIntervalsResponse(BaseModel):
    snapshot_dates: SnapshotDatesByKind
    intervals: list[SnapshotIntervalItem] = Field(
        description="Consecutive asset (net worth) snapshot pairs, newest first."
    )
    interval_rule: str
    status_note: str = COMPLETE_STATUS_NOTE


class EmergencyFundBaseline(BaseModel):
    method: Literal["median_of_recent_closed_months"] = "median_of_recent_closed_months"
    months_requested: int
    periods: list[str]
    month_count: int
    status: Literal["full", "fewer_than_requested", "none"]
    limited_by: Literal["data_start", "baseline_start_date"] | None
    baseline_start_date: date | None
    skipped_periods: list[str]
    last_closed_period: str | None


class EmergencyFundResponse(BaseModel):
    status: EmergencyFundStatus
    status_reasons: list[str]
    formula: str = "emergency_fund_months = cash_like_total ÷ monthly_protected_outflow"
    asset_snapshot_date: date | None
    cash_like_total: int | None
    cash_like_name_rule_total: int | None = Field(
        description=(
            "Part of cash_like_total judged only by the existing name rule "
            "because the row has no human liquidity metadata."
        )
    )
    cash_like_basis: str
    monthly_protected_outflow: int | None = Field(
        description="Median of protected_spend over the baseline months (보호 지급)."
    )
    monthly_adjustability_undecided_outflow: int | None = Field(
        description="Median of adjustability_undecided_total over the same months."
    )
    adjustability_undecided_share: float | None = Field(
        description="Σ undecided ÷ Σ total_outflow over the baseline months."
    )
    adjustability_undecided_transaction_count: int = Field(
        default=0,
        description="Distinct transactions with undecided expense lines over the baseline months.",
    )
    emergency_fund_months: float | None
    baseline: EmergencyFundBaseline
    legacy_surface: str
    contract: MetricContract
