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
        Transaction.category_major_user.is_not(None),
        Transaction.category_minor_user.is_not(None),
        Transaction.merchant != Transaction.description,
        Transaction.cost_classification_source == "manual",
        Transaction.spend_necessity.is_not(None),
        Transaction.recurring_payment_kind.is_not(None),
        Transaction.memo.is_not(None),
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
            Transaction.cost_kind.label("cost_kind"),
            Transaction.fixed_cost_necessity.label("fixed_cost_necessity"),
            Transaction.spend_necessity.label("spend_necessity"),
            Transaction.cost_classification_source.label("cost_classification_source"),
            Transaction.recurring_payment_kind.label("recurring_payment_kind"),
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
                "cash_equivalent_total", Numeric(15, 2), nullable=False
            ),
            SchemaColumnDefinition("near_liquid_total", Numeric(15, 2), nullable=False),
            SchemaColumnDefinition("illiquid_total", Numeric(15, 2), nullable=False),
            SchemaColumnDefinition("loan_balance_total", Numeric(15, 2), nullable=False),
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
        name="vw_category_monthly_spend",
        description=(
            "Canonical monthly spend aggregate. Uses effective categories and excludes "
            "deleted or merged transactions for analytics."
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
            "Canonical monthly fixed/variable cost aggregate. Uses transaction cost "
            "classification fields, excludes deleted or merged expense transactions, "
            "and keeps loan-linked repayments out of ordinary fixed-cost totals."
        ),
        recommended_for_ai=True,
        columns=(
            SchemaColumnDefinition("period", String(length=7), nullable=False),
            SchemaColumnDefinition("expense_total", Integer(), nullable=False),
            SchemaColumnDefinition("fixed_total", Integer(), nullable=False),
            SchemaColumnDefinition("variable_total", Integer(), nullable=False),
            SchemaColumnDefinition("essential_fixed_total", Integer(), nullable=False),
            SchemaColumnDefinition(
                "discretionary_fixed_total", Integer(), nullable=False
            ),
            SchemaColumnDefinition(
                "essential_variable_total", Integer(), nullable=False
            ),
            SchemaColumnDefinition(
                "discretionary_variable_total", Integer(), nullable=False
            ),
            SchemaColumnDefinition("required_spend_total", Integer(), nullable=False),
            SchemaColumnDefinition(
                "discretionary_spend_total", Integer(), nullable=False
            ),
            SchemaColumnDefinition("unclassified_total", Integer(), nullable=False),
            SchemaColumnDefinition("unclassified_count", Integer(), nullable=False),
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
            "loan repayment, keeps transfer activity separate, and exposes fixed, "
            "variable, unclassified, net cashflow, and savings-rate fields."
        ),
        recommended_for_ai=True,
        columns=(
            SchemaColumnDefinition("period", String(length=7), nullable=False),
            SchemaColumnDefinition("income_total", Integer(), nullable=False),
            SchemaColumnDefinition("expense_total", Integer(), nullable=False),
            SchemaColumnDefinition("non_loan_expense_total", Integer(), nullable=False),
            SchemaColumnDefinition(
                "transfer_activity_total", Integer(), nullable=False
            ),
            SchemaColumnDefinition("loan_repayment_total", Integer(), nullable=False),
            SchemaColumnDefinition("fixed_total", Integer(), nullable=False),
            SchemaColumnDefinition("variable_total", Integer(), nullable=False),
            SchemaColumnDefinition("essential_fixed_total", Integer(), nullable=False),
            SchemaColumnDefinition(
                "discretionary_fixed_total",
                Integer(),
                nullable=False,
            ),
            SchemaColumnDefinition(
                "essential_variable_total",
                Integer(),
                nullable=False,
            ),
            SchemaColumnDefinition(
                "discretionary_variable_total",
                Integer(),
                nullable=False,
            ),
            SchemaColumnDefinition(
                "required_spend_total",
                Integer(),
                nullable=False,
            ),
            SchemaColumnDefinition(
                "discretionary_spend_total",
                Integer(),
                nullable=False,
            ),
            SchemaColumnDefinition(
                "unclassified_expense_total", Integer(), nullable=False
            ),
            SchemaColumnDefinition("net_cashflow", Integer(), nullable=False),
            SchemaColumnDefinition("savings_rate", Numeric(12, 4), nullable=True),
        ),
    ),
    SchemaViewDefinition(
        name="vw_transactions_effective",
        description=(
            "Canonical transaction read model. Prefer this for AI and analysis queries; "
            "it excludes deleted or merged rows while preserving effective category columns. "
            "Use raw transactions when auditing import fidelity or low-level mutations."
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
            SchemaColumnDefinition("cost_kind", String(length=20), nullable=True),
            SchemaColumnDefinition(
                "fixed_cost_necessity", String(length=20), nullable=True
            ),
            SchemaColumnDefinition("spend_necessity", String(length=20), nullable=True),
            SchemaColumnDefinition(
                "cost_classification_source", String(length=20), nullable=True
            ),
            SchemaColumnDefinition(
                "recurring_payment_kind", String(length=30), nullable=True
            ),
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
            SchemaColumnDefinition("is_edited", Boolean(), nullable=False),
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
            "Canonical monthly spendable-income view. Shows income after loan "
            "repayments and fixed commitments before variable spend, plus the "
            "remaining amount after observed variable spend."
        ),
        recommended_for_ai=True,
        columns=(
            SchemaColumnDefinition("period", String(length=7), nullable=False),
            SchemaColumnDefinition("income_total", Integer(), nullable=False),
            SchemaColumnDefinition("loan_repayment_total", Integer(), nullable=False),
            SchemaColumnDefinition("fixed_commitment_total", Integer(), nullable=False),
            SchemaColumnDefinition("variable_total", Integer(), nullable=False),
            SchemaColumnDefinition(
                "required_variable_total", Integer(), nullable=False
            ),
            SchemaColumnDefinition(
                "discretionary_variable_total", Integer(), nullable=False
            ),
            SchemaColumnDefinition(
                "spendable_before_variable_spend",
                Integer(),
                nullable=False,
            ),
            SchemaColumnDefinition(
                "remaining_after_variable_spend",
                Integer(),
                nullable=False,
            ),
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
            SchemaColumnDefinition("needs_cost_kind", Boolean(), nullable=False),
            SchemaColumnDefinition(
                "needs_fixed_cost_necessity",
                Boolean(),
                nullable=False,
            ),
            SchemaColumnDefinition(
                "needs_spend_necessity",
                Boolean(),
                nullable=False,
            ),
            SchemaColumnDefinition(
                "needs_recurring_payment_kind",
                Boolean(),
                nullable=False,
            ),
            SchemaColumnDefinition("needs_loan_link_review", Boolean(), nullable=False),
            SchemaColumnDefinition("merchant_expense_count", Integer(), nullable=False),
            SchemaColumnDefinition("priority_score", Integer(), nullable=False),
            SchemaColumnDefinition(
                "priority_reason", String(length=40), nullable=False
            ),
        ),
    ),
    SchemaViewDefinition(
        name="vw_recurring_merchant_monthly",
        description=(
            "Canonical monthly recurring merchant aggregate. Uses normalized "
            "merchant values and stored recurring payment classifications."
        ),
        recommended_for_ai=True,
        columns=(
            SchemaColumnDefinition("period", String(length=7), nullable=False),
            SchemaColumnDefinition("merchant", String(length=500), nullable=False),
            SchemaColumnDefinition(
                "recurring_payment_kind", String(length=30), nullable=False
            ),
            SchemaColumnDefinition("monthly_spend", Integer(), nullable=False),
            SchemaColumnDefinition("transaction_count", Integer(), nullable=False),
            SchemaColumnDefinition("first_date", Date(), nullable=False),
            SchemaColumnDefinition("last_date", Date(), nullable=False),
        ),
    ),
)
