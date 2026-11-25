from dataclasses import dataclass

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Integer,
    Numeric,
    String,
    Text,
    Time,
    case,
    func,
    or_,
    select,
)
from sqlalchemy.sql.elements import ColumnElement
from sqlalchemy.sql.selectable import Select

from app.models.loan import Loan
from app.models.loan_account import LoanAccount
from app.models.loan_transaction_link import LoanTransactionLink
from app.models.transaction import Transaction
from app.models.nature_axes import TransactionNatureOverride
from app.services.metric_views import METRIC_VIEWS


@dataclass(frozen=True, slots=True)
class SchemaColumnDefinition:
    name: str
    type: object
    nullable: bool


@dataclass(frozen=True, slots=True)
class SchemaViewDefinition:
    name: str
    description: str
    recommended_for_ai: bool
    columns: tuple[SchemaColumnDefinition, ...]


def transaction_is_edited_clause() -> ColumnElement[bool]:
    return or_(
        Transaction.legacy_classification_edited.is_(True),
        Transaction.category_major_user.is_not(None),
        Transaction.category_minor_user.is_not(None),
        Transaction.merchant != Transaction.description,
        Transaction.memo.is_not(None),
        select(TransactionNatureOverride.transaction_id)
        .where(
            TransactionNatureOverride.transaction_id == Transaction.id,
            TransactionNatureOverride.source.in_(("user", "legacy_edit")),
        )
        .exists(),
    )


def build_transactions_effective_select(
    *,
    include_deleted: bool = False,
    include_merged: bool = False,
) -> Select:
    latest_loan_date_subquery = (
        select(
            Loan.lender.label("lender"),
            Loan.product_name.label("product_name"),
            func.max(Loan.snapshot_date).label("latest_snapshot_date"),
        )
        .group_by(Loan.lender, Loan.product_name)
        .subquery()
    )
    latest_loan_subquery = (
        select(
            Loan.lender.label("lender"),
            Loan.product_name.label("product_name"),
            Loan.start_date.label("loan_start_date"),
            Loan.maturity_date.label("loan_maturity_date"),
        )
        .join(
            latest_loan_date_subquery,
            (Loan.lender == latest_loan_date_subquery.c.lender)
            & (Loan.product_name == latest_loan_date_subquery.c.product_name)
            & (Loan.snapshot_date == latest_loan_date_subquery.c.latest_snapshot_date),
        )
        .subquery()
    )
    query = (
        select(
            Transaction.id.label("id"),
            Transaction.date.label("date"),
            Transaction.time.label("time"),
            Transaction.type.label("type"),
            Transaction.category_major.label("category_major"),
            Transaction.category_minor.label("category_minor"),
            Transaction.category_major_user.label("category_major_user"),
            Transaction.category_minor_user.label("category_minor_user"),
            func.coalesce(
                Transaction.category_major_user, Transaction.category_major
            ).label("effective_category_major"),
            func.coalesce(
                Transaction.category_minor_user, Transaction.category_minor
            ).label("effective_category_minor"),
            Transaction.description.label("description"),
            Transaction.merchant.label("merchant"),
            Transaction.amount.label("amount"),
            Transaction.currency.label("currency"),
            Transaction.payment_method.label("payment_method"),
            Transaction.memo.label("memo"),
            LoanTransactionLink.loan_account_id.label("loan_account_id"),
            LoanAccount.lender.label("loan_lender"),
            LoanAccount.product_name.label("loan_product_name"),
            func.coalesce(
                LoanAccount.display_name_user,
                LoanAccount.lender + " " + LoanAccount.product_name,
            ).label("loan_display_name"),
            LoanAccount.loan_kind.label("loan_kind"),
            latest_loan_subquery.c.loan_start_date.label("loan_start_date"),
            latest_loan_subquery.c.loan_maturity_date.label("loan_maturity_date"),
            LoanTransactionLink.repayment_type.label("loan_repayment_type"),
            LoanTransactionLink.memo.label("loan_link_memo"),
            Transaction.is_deleted.label("is_deleted"),
            Transaction.merged_into_id.label("merged_into_id"),
            case((transaction_is_edited_clause(), True), else_=False).label(
                "is_edited"
            ),
            Transaction.source.label("source"),
            Transaction.source_lifecycle_status.label("source_lifecycle_status"),
            Transaction.source_row_hash.label("source_row_hash"),
            Transaction.first_seen_import_id.label("first_seen_import_id"),
            Transaction.last_seen_import_id.label("last_seen_import_id"),
            Transaction.source_first_seen_at.label("source_first_seen_at"),
            Transaction.source_last_seen_at.label("source_last_seen_at"),
            Transaction.superseded_by_transaction_id.label(
                "superseded_by_transaction_id"
            ),
            Transaction.created_at.label("created_at"),
            Transaction.updated_at.label("updated_at"),
        )
        .select_from(Transaction)
        .outerjoin(
            LoanTransactionLink,
            LoanTransactionLink.transaction_id == Transaction.id,
        )
        .outerjoin(
            LoanAccount,
            LoanAccount.id == LoanTransactionLink.loan_account_id,
        )
        .outerjoin(
            latest_loan_subquery,
            (latest_loan_subquery.c.lender == LoanAccount.lender)
            & (latest_loan_subquery.c.product_name == LoanAccount.product_name),
        )
    )
    if not include_deleted:
        query = query.where(Transaction.is_deleted.is_(False))
    if not include_merged:
        query = query.where(Transaction.merged_into_id.is_(None))
    return query


CANONICAL_VIEWS: tuple[SchemaViewDefinition, ...] = (
    SchemaViewDefinition(
        name="vw_asset_snapshot_canonical",
        description=(
            "Canonical asset/liability snapshot read model. Aggregates asset snapshots "
            "with loan snapshot debt metadata by snapshot_date and exposes liquidity "
            "tiers, cash-equivalent totals, loan balances, and confirmed monthly debt "
            "payments without investment-product performance assumptions."
        ),
        recommended_for_ai=True,
        columns=(
            SchemaColumnDefinition("snapshot_date", Date(), nullable=False),
            SchemaColumnDefinition("asset_total", Numeric(15, 2), nullable=False),
            SchemaColumnDefinition("liability_total", Numeric(15, 2), nullable=False),
            SchemaColumnDefinition("net_worth", Numeric(15, 2), nullable=False),
            SchemaColumnDefinition(
                "negative_asset_excluded_total",
                Numeric(15, 2),
                nullable=False,
            ),
            SchemaColumnDefinition(
                "cash_equivalent_total", Numeric(15, 2), nullable=False
            ),
            SchemaColumnDefinition("near_liquid_total", Numeric(15, 2), nullable=False),
            SchemaColumnDefinition("illiquid_total", Numeric(15, 2), nullable=False),
            SchemaColumnDefinition(
                "loan_balance_total", Numeric(15, 2), nullable=False
            ),
            SchemaColumnDefinition(
                "monthly_debt_payment_total",
                Numeric(15, 2),
                nullable=False,
            ),
            SchemaColumnDefinition("asset_row_count", Integer(), nullable=False),
            SchemaColumnDefinition("loan_row_count", Integer(), nullable=False),
        ),
    ),
    SchemaViewDefinition(
        name="vw_loan_account_canonical",
        description=(
            "Canonical latest loan-account structure read model. Uses stable "
            "lender/product identity, includes unmapped loan snapshots, and exposes "
            "user-hidden state plus a simple monthly interest estimate for "
            "agent-side prioritization."
        ),
        recommended_for_ai=True,
        columns=(
            SchemaColumnDefinition("loan_account_id", Integer(), nullable=True),
            SchemaColumnDefinition("display_name", String(length=200), nullable=False),
            SchemaColumnDefinition("lender", String(length=50), nullable=False),
            SchemaColumnDefinition("product_name", String(length=200), nullable=False),
            SchemaColumnDefinition("loan_kind", String(length=40), nullable=True),
            SchemaColumnDefinition("is_hidden", Boolean(), nullable=False),
            SchemaColumnDefinition("snapshot_date", Date(), nullable=False),
            SchemaColumnDefinition("principal", Numeric(15, 2), nullable=True),
            SchemaColumnDefinition("balance", Numeric(15, 2), nullable=True),
            SchemaColumnDefinition("interest_rate", Numeric(5, 2), nullable=True),
            SchemaColumnDefinition("monthly_payment", Numeric(15, 2), nullable=True),
            SchemaColumnDefinition(
                "monthly_payment_source",
                String(length=50),
                nullable=True,
            ),
            SchemaColumnDefinition(
                "repayment_method", String(length=50), nullable=True
            ),
            SchemaColumnDefinition("start_date", Date(), nullable=True),
            SchemaColumnDefinition("maturity_date", Date(), nullable=True),
            SchemaColumnDefinition(
                "estimated_monthly_interest",
                Numeric(15, 2),
                nullable=True,
            ),
        ),
    ),
    SchemaViewDefinition(
        name="vw_income_monthly_by_category",
        description=(
            "Canonical monthly income composition read model. Groups effective "
            "major categories from income transactions and reconciles to monthly "
            "cashflow income totals."
        ),
        recommended_for_ai=True,
        columns=(
            SchemaColumnDefinition("period", String(length=7), nullable=False),
            SchemaColumnDefinition(
                "effective_category_major",
                String(length=50),
                nullable=False,
            ),
            SchemaColumnDefinition("income_total", Integer(), nullable=False),
            SchemaColumnDefinition("transaction_count", Integer(), nullable=False),
        ),
    ),
    SchemaViewDefinition(
        name="vw_category_monthly_spend",
        description=(
            "Canonical monthly spend aggregate (signed SUM of 지출, spend negative). "
            "Reads vw_metric_flow_lines: effective categories, no deleted, merged, "
            "superseded, or non-KRW rows; refunds stay in their posting month."
        ),
        recommended_for_ai=True,
        columns=(
            SchemaColumnDefinition("period", String(length=7), nullable=False),
            SchemaColumnDefinition("category_major", String(length=50), nullable=False),
            SchemaColumnDefinition("category_minor", String(length=50), nullable=True),
            SchemaColumnDefinition("amount", Integer(), nullable=False),
        ),
    ),
    SchemaViewDefinition(
        name="vw_fixed_cost_monthly_summary",
        description=(
            "Retained monthly non-loan expense totals only. Legacy fixed/variable and necessity projections retired; use vw_monthly_flow_summary and vw_spend_cube."
        ),
        recommended_for_ai=True,
        columns=(
            SchemaColumnDefinition("period", String(length=7), nullable=False),
            SchemaColumnDefinition("expense_total", Integer(), nullable=False),
            SchemaColumnDefinition("living_spend", Integer(), nullable=False),
        ),
    ),
    SchemaViewDefinition(
        name="vw_loan_repayment_monthly",
        description=(
            "Canonical monthly loan repayment aggregate. Includes only transactions "
            "linked through loan_transaction_links and groups repayment totals by "
            "stable loan account and repayment type."
        ),
        recommended_for_ai=True,
        columns=(
            SchemaColumnDefinition("period", String(length=7), nullable=False),
            SchemaColumnDefinition("loan_account_id", Integer(), nullable=False),
            SchemaColumnDefinition(
                "loan_display_name", String(length=200), nullable=True
            ),
            SchemaColumnDefinition("loan_lender", String(length=50), nullable=True),
            SchemaColumnDefinition(
                "loan_product_name", String(length=200), nullable=True
            ),
            SchemaColumnDefinition("loan_kind", String(length=40), nullable=True),
            SchemaColumnDefinition("loan_maturity_date", Date(), nullable=True),
            SchemaColumnDefinition(
                "loan_repayment_type", String(length=20), nullable=True
            ),
            SchemaColumnDefinition("repayment_total", Integer(), nullable=False),
            SchemaColumnDefinition("transaction_count", Integer(), nullable=False),
        ),
    ),
    SchemaViewDefinition(
        name="vw_merchant_monthly_baseline",
        description=(
            "Canonical merchant monthly spend baseline. Uses non-loan expense rows, "
            "effective categories, and prior active merchant months to expose a "
            "trailing 3-month baseline and delta."
        ),
        recommended_for_ai=True,
        columns=(
            SchemaColumnDefinition("period", String(length=7), nullable=False),
            SchemaColumnDefinition("merchant", String(length=500), nullable=False),
            SchemaColumnDefinition(
                "effective_category_major",
                String(length=50),
                nullable=False,
            ),
            SchemaColumnDefinition(
                "effective_category_minor",
                String(length=50),
                nullable=True,
            ),
            SchemaColumnDefinition("monthly_spend", Integer(), nullable=False),
            SchemaColumnDefinition("transaction_count", Integer(), nullable=False),
            SchemaColumnDefinition("baseline_month_count", Integer(), nullable=False),
            SchemaColumnDefinition(
                "trailing_3_month_avg",
                Numeric(15, 2),
                nullable=True,
            ),
            SchemaColumnDefinition("baseline_delta", Numeric(15, 2), nullable=True),
            SchemaColumnDefinition("baseline_delta_pct", Numeric(12, 4), nullable=True),
        ),
    ),
    SchemaViewDefinition(
        name="vw_monthly_cashflow",
        description=(
            "Canonical monthly cashflow aggregate. Separates ordinary expense from "
            "loan repayment, keeps transfer activity separate, and exposes net cashflow and savings rate. Legacy classification totals retired."
        ),
        recommended_for_ai=True,
        columns=(
            SchemaColumnDefinition("period", String(length=7), nullable=False),
            SchemaColumnDefinition("income_total", Integer(), nullable=False),
            SchemaColumnDefinition("expense_total", Integer(), nullable=False),
            SchemaColumnDefinition("total_outflow", Integer(), nullable=False),
            SchemaColumnDefinition("living_spend", Integer(), nullable=False),
            SchemaColumnDefinition("non_loan_expense_total", Integer(), nullable=False),
            SchemaColumnDefinition(
                "transfer_activity_total", Integer(), nullable=False
            ),
            SchemaColumnDefinition("loan_repayment_total", Integer(), nullable=False),
            SchemaColumnDefinition("net_cashflow", Integer(), nullable=False),
            SchemaColumnDefinition("savings_rate", Numeric(12, 4), nullable=True),
        ),
    ),
    SchemaViewDefinition(
        name="vw_transactions_effective",
        description=(
            "Canonical transaction read model. It excludes deleted or merged rows while "
            "preserving effective category columns, but keeps superseded rows and every "
            "currency for lineage. For totals use vw_metric_flow_lines or the monthly "
            "views built on it. Use raw transactions when auditing import fidelity."
        ),
        recommended_for_ai=True,
        columns=(
            SchemaColumnDefinition("id", Integer(), nullable=False),
            SchemaColumnDefinition("date", Date(), nullable=False),
            SchemaColumnDefinition("time", Time(), nullable=False),
            SchemaColumnDefinition("type", String(length=10), nullable=False),
            SchemaColumnDefinition("category_major", String(length=50), nullable=False),
            SchemaColumnDefinition("category_minor", String(length=50), nullable=True),
            SchemaColumnDefinition(
                "category_major_user", String(length=50), nullable=True
            ),
            SchemaColumnDefinition(
                "category_minor_user", String(length=50), nullable=True
            ),
            SchemaColumnDefinition(
                "effective_category_major",
                String(length=50),
                nullable=False,
            ),
            SchemaColumnDefinition(
                "effective_category_minor",
                String(length=50),
                nullable=True,
            ),
            SchemaColumnDefinition("description", String(length=500), nullable=False),
            SchemaColumnDefinition("merchant", String(length=500), nullable=False),
            SchemaColumnDefinition("amount", Integer(), nullable=False),
            SchemaColumnDefinition("currency", String(length=5), nullable=False),
            SchemaColumnDefinition("payment_method", String(length=100), nullable=True),
            SchemaColumnDefinition("memo", Text(), nullable=True),
            SchemaColumnDefinition("loan_account_id", Integer(), nullable=True),
            SchemaColumnDefinition("loan_lender", String(length=50), nullable=True),
            SchemaColumnDefinition(
                "loan_product_name", String(length=200), nullable=True
            ),
            SchemaColumnDefinition(
                "loan_display_name", String(length=200), nullable=True
            ),
            SchemaColumnDefinition("loan_kind", String(length=40), nullable=True),
            SchemaColumnDefinition("loan_start_date", Date(), nullable=True),
            SchemaColumnDefinition("loan_maturity_date", Date(), nullable=True),
            SchemaColumnDefinition(
                "loan_repayment_type", String(length=20), nullable=True
            ),
            SchemaColumnDefinition("loan_link_memo", Text(), nullable=True),
            SchemaColumnDefinition("is_deleted", Boolean(), nullable=False),
            SchemaColumnDefinition("merged_into_id", Integer(), nullable=True),
            SchemaColumnDefinition("source", String(length=10), nullable=False),
            SchemaColumnDefinition(
                "created_at", DateTime(timezone=True), nullable=False
            ),
            SchemaColumnDefinition(
                "updated_at", DateTime(timezone=True), nullable=False
            ),
        ),
    ),
    SchemaViewDefinition(
        name="vw_true_spendable_monthly",
        description=(
            "Legacy classification formulas retired. Only period, income and loan repayment remain; use vw_monthly_flow_summary."
        ),
        recommended_for_ai=True,
        columns=(
            SchemaColumnDefinition("period", String(length=7), nullable=False),
            SchemaColumnDefinition("income_total", Integer(), nullable=False),
            SchemaColumnDefinition("loan_repayment_total", Integer(), nullable=False),
        ),
    ),
    SchemaViewDefinition(
        name="vw_unclassified_work_queue",
        description=(
            "Canonical data-quality queue for transactions that reduce analytics "
            "confidence. Flags missing cost classification, fixed-cost necessity, "
            "monthly recurring classification candidates, and likely missing loan "
            "repayment links."
        ),
        recommended_for_ai=True,
        columns=(
            SchemaColumnDefinition("transaction_id", Integer(), nullable=False),
            SchemaColumnDefinition("date", Date(), nullable=False),
            SchemaColumnDefinition("type", String(length=10), nullable=False),
            SchemaColumnDefinition("merchant", String(length=500), nullable=False),
            SchemaColumnDefinition(
                "effective_category_major", String(length=50), nullable=False
            ),
            SchemaColumnDefinition(
                "effective_category_minor", String(length=50), nullable=True
            ),
            SchemaColumnDefinition("amount", Integer(), nullable=False),
            SchemaColumnDefinition("amount_abs", Integer(), nullable=False),
            SchemaColumnDefinition(
                "needs_adjustability",
                Boolean(),
                nullable=False,
            ),
            SchemaColumnDefinition("needs_loan_link_review", Boolean(), nullable=False),
            SchemaColumnDefinition("merchant_expense_count", Integer(), nullable=False),
        ),
    ),
)

METRIC_VIEW_DESCRIPTIONS = {
    "vw_metric_refund_allocations": (
        "Confirmed settlement allocations (auto_confirmed/user_confirmed) whose "
        "purchase and refund are both effective KRW 지출 rows."
    ),
    "vw_metric_transactions": (
        "Effective transactions for metrics (유효 거래): excludes deleted, merged, "
        "and superseded rows; keeps every currency with currency column; adds loan "
        "and installment links and confirmed refund allocation totals."
    ),
    "vw_transaction_nature": (
        "Two-axis nature per effective transaction (T056): payment_form "
        "(committed/ad_hoc/not_applicable) with commitment_kind "
        "(loan/installment/recurring) and recurring_commitment_id, and "
        "adjustability (protected/adjustable/undecided/not_applicable) with "
        "adjustability_source (fixed_loan/fixed_installment/transaction/"
        "commitment/category_default/none) and the value at each level. 수입·이체 "
        "are not_applicable and never undecided."
    ),
    "vw_transfer_purpose": (
        "T061 human-set purpose per effective 이체: investment (to/from a holding "
        "in the investments snapshot), savings (to/from a savings deposit that is "
        "not an investments row), internal_move (other own-account move), or "
        "undecided (nothing set). Precedence transaction > merchant rule > "
        "category rule; purpose_source says which applied. Never inferred."
    ),
    "vw_metric_flow_lines": (
        "Every won of every effective KRW transaction assigned to exactly one "
        "monthly-flow row (flow_section/flow_row) with payment form and "
        "adjustability read from vw_transaction_nature (T056 two axes). Refunds "
        "stay in their posting month; confirmed allocations take the original "
        "purchase's classification. Prefer this over "
        "re-aggregating vw_transactions_effective. T061: 이체 lines carry "
        "transfer_purpose (investment/savings/internal_move/undecided) and "
        "transfer_purpose_source from vw_transfer_purpose; null otherwise. "
        "T067: one_off_event_id is the attributed transaction's direct event "
        "on uncommitted expense lines only."
    ),
    "vw_metric_as_of": (
        "Single-row data status: transaction as-of date, last closed and "
        "in-progress month, and per-kind snapshot as-of dates (never merged)."
    ),
    "vw_monthly_flow": "Monthly flow table in long form (period x flow row).",
    "vw_monthly_flow_summary": (
        "Monthly flow table totals: income, committed, ad hoc, undecided, "
        "total_outflow (총지급), living_spend (생활 지출), adjustable_spend, "
        "residual (잔여), transfer_net, and month_status (closed/in_progress). "
        "T061: transfer_net split by human-set purpose (transfer_investment_net, "
        "transfer_savings_net, transfer_investment_savings_net, "
        "transfer_internal_move_net, transfer_undecided_net) plus "
        "transfer_undecided_activity_total. T067 appends one_off_total (net "
        "attributed expense), ongoing_outflow and ongoing_living_spend."
    ),
    "vw_spend_cube": (
        "Spend cube: month x category x merchant x payment form x adjustability "
        "net spend with charge/refund split."
    ),
    "vw_metric_excluded_currency": (
        "Non-KRW effective transactions excluded from every metric total, by "
        "period/currency/type. Never summed with KRW."
    ),
}


def _metric_schema_views() -> tuple[SchemaViewDefinition, ...]:
    return tuple(
        SchemaViewDefinition(
            name=view.name,
            description=METRIC_VIEW_DESCRIPTIONS[view.name],
            recommended_for_ai=True,
            columns=tuple(
                SchemaColumnDefinition(selected.name, selected.type, nullable=True)
                for selected in view.definition.selected_columns
            ),
        )
        for view in METRIC_VIEWS
    )


def _net_worth_schema_views() -> tuple[SchemaViewDefinition, ...]:
    from app.services.net_worth_views import (
        NET_WORTH_VIEW_DESCRIPTIONS,
        NET_WORTH_VIEWS,
    )

    return tuple(
        SchemaViewDefinition(
            name=view.name,
            description=NET_WORTH_VIEW_DESCRIPTIONS[view.name],
            recommended_for_ai=True,
            columns=tuple(
                SchemaColumnDefinition(selected.name, selected.type, nullable=True)
                for selected in view.definition.selected_columns
            ),
        )
        for view in NET_WORTH_VIEWS
    )


CANONICAL_VIEWS = CANONICAL_VIEWS + _metric_schema_views() + _net_worth_schema_views()
