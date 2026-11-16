"""Single SQL definition of the metric view layer (T054/T055/T056/T061).

Chain: transactions -> vw_metric_refund_allocations / vw_metric_transactions
(effective transactions) -> vw_transaction_nature (two-axis nature per
transaction, T056) and vw_transfer_purpose (human-set purpose per 이체, T061)
-> vw_metric_flow_lines (every KRW won of every effective transaction assigned
to exactly one monthly-flow row; 이체 lines also carry exactly one transfer
purpose) -> vw_monthly_flow, vw_monthly_flow_summary, vw_spend_cube.

The PostgreSQL views are created by the newest metric-view Alembic migration
(20261117_0041, superseding 0039, 0038 and 0035) from a frozen copy of the SQL
compiled here;
``tests/migrations`` guards that the frozen SQL and these definitions never
drift. Services read the views by name
through the ``*_VIEW`` table handles below and must not re-aggregate the same
actuals in Python.
"""

from dataclasses import dataclass

from sqlalchemy import (
    Integer,
    String,
    and_,
    case,
    false,
    func,
    literal,
    not_,
    null,
    or_,
    select,
    true,
    union_all,
)
from sqlalchemy.engine import Dialect
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.sql.elements import ColumnElement
from sqlalchemy.sql.functions import FunctionElement
from sqlalchemy.sql.selectable import Select, TableClause
from sqlalchemy.sql.expression import column, table

from app.models.asset_snapshot import AssetSnapshot
from app.models.installment_transaction_link import InstallmentTransactionLink
from app.models.insurance_contract import InsuranceContract
from app.models.investment import Investment
from app.models.loan import Loan
from app.models.loan_transaction_link import LoanTransactionLink
from app.models.nature_axes import (
    CategoryAdjustabilityDefault,
    RecurringCommitment,
    TransactionNatureOverride,
)
from app.models.settlement_group import SettlementMatch
from app.models.transaction import Transaction
from app.models.transfer_purpose import TransferPurposeOverride, TransferPurposeRule
from app.models.user_profile_snapshot import UserProfileSnapshot

FLOW_DEFINITION = "monthly_flow.v2"
SPEND_CUBE_DEFINITION = "spend_cube.v2"
METRIC_CURRENCY = "KRW"
EXPENSE = "지출"
INCOME = "수입"
TRANSFER = "이체"


# --------------------------------------------------------------------------
# Dialect-portable date helpers (PostgreSQL in production, SQLite in tests).
# --------------------------------------------------------------------------


class month_key(FunctionElement):  # noqa: N801 - SQL function style
    """``YYYY-MM`` of a date."""

    type = String()
    name = "month_key"
    inherit_cache = True


class day_of_month(FunctionElement):  # noqa: N801
    type = Integer()
    name = "day_of_month"
    inherit_cache = True


class last_closed_period(FunctionElement):  # noqa: N801
    """``YYYY-MM`` of the latest month fully covered up to the given date.

    The month of the date itself when the date is the month's last day,
    otherwise the previous month.
    """

    type = String()
    name = "last_closed_period"
    inherit_cache = True


def _only_arg(element: FunctionElement, compiler, **kw) -> str:  # type: ignore[no-untyped-def]
    (argument,) = list(element.clauses)
    return compiler.process(argument, **kw)


@compiles(month_key, "postgresql")
def _month_key_pg(element, compiler, **kw):  # type: ignore[no-untyped-def]
    return f"to_char({_only_arg(element, compiler, **kw)}, 'YYYY-MM')"


@compiles(month_key, "sqlite")
def _month_key_sqlite(element, compiler, **kw):  # type: ignore[no-untyped-def]
    return f"strftime('%Y-%m', {_only_arg(element, compiler, **kw)})"


@compiles(day_of_month, "postgresql")
def _day_of_month_pg(element, compiler, **kw):  # type: ignore[no-untyped-def]
    return f"CAST(EXTRACT(DAY FROM {_only_arg(element, compiler, **kw)}) AS INTEGER)"


@compiles(day_of_month, "sqlite")
def _day_of_month_sqlite(element, compiler, **kw):  # type: ignore[no-untyped-def]
    return f"CAST(strftime('%d', {_only_arg(element, compiler, **kw)}) AS INTEGER)"


@compiles(last_closed_period, "postgresql")
def _last_closed_period_pg(element, compiler, **kw):  # type: ignore[no-untyped-def]
    argument = _only_arg(element, compiler, **kw)
    return (
        "to_char(CAST(date_trunc('month', CAST(CAST("
        f"{argument} AS DATE) + 1 AS TIMESTAMP)) AS DATE) - 1, 'YYYY-MM')"
    )


@compiles(last_closed_period, "sqlite")
def _last_closed_period_sqlite(element, compiler, **kw):  # type: ignore[no-untyped-def]
    argument = _only_arg(element, compiler, **kw)
    return f"strftime('%Y-%m', date({argument}, '+1 day', 'start of month', '-1 day'))"


# --------------------------------------------------------------------------
# View definitions.
# --------------------------------------------------------------------------

_transactions = Transaction.__table__
_matches = SettlementMatch.__table__
_loan_links = LoanTransactionLink.__table__
_installment_links = InstallmentTransactionLink.__table__
_commitments = RecurringCommitment.__table__
_defaults = CategoryAdjustabilityDefault.__table__
_overrides = TransactionNatureOverride.__table__
_transfer_overrides = TransferPurposeOverride.__table__
_transfer_rules = TransferPurposeRule.__table__


def _is_effective(transactions) -> ColumnElement[bool]:  # type: ignore[no-untyped-def]
    """Effective transaction basis: not deleted, merged, or superseded."""
    return and_(
        transactions.c.is_deleted == false(),
        transactions.c.merged_into_id.is_(None),
        transactions.c.superseded_by_transaction_id.is_(None),
        or_(
            transactions.c.source_lifecycle_status.is_(None),
            transactions.c.source_lifecycle_status != "superseded",
        ),
    )


def _is_metric_currency(currency_column) -> ColumnElement[bool]:  # type: ignore[no-untyped-def]
    return func.upper(currency_column) == METRIC_CURRENCY


def _refund_allocations_select(transactions=_transactions) -> Select:
    prefix = "" if transactions is _transactions else "preview_source_"
    original = transactions.alias(f"{prefix}original_tx")
    refund = transactions.alias(f"{prefix}refund_tx")
    return (
        select(
            _matches.c.id.label("settlement_match_id"),
            _matches.c.settlement_transaction_id.label("refund_transaction_id"),
            _matches.c.original_transaction_id.label("original_transaction_id"),
            _matches.c.matched_amount.label("matched_amount"),
            _matches.c.status.label("status"),
        )
        .select_from(
            _matches.join(
                original, original.c.id == _matches.c.original_transaction_id
            ).join(refund, refund.c.id == _matches.c.settlement_transaction_id)
        )
        .where(_matches.c.status.in_(["auto_confirmed", "user_confirmed"]))
        .where(_matches.c.matched_amount > 0)
        .where(_is_effective(original))
        .where(_is_effective(refund))
        .where(original.c.type == EXPENSE)
        .where(original.c.amount < 0)
        .where(refund.c.type == EXPENSE)
        .where(refund.c.amount > 0)
        .where(_is_metric_currency(original.c.currency))
        .where(_is_metric_currency(refund.c.currency))
    )


def view_table(name: str, definition: Select) -> TableClause:
    """A typed, read-only handle for a view created from ``definition``."""
    return table(
        name,
        *[
            column(selected.name, selected.type)
            for selected in definition.selected_columns
        ],
    )


REFUND_ALLOCATIONS_DEFINITION = _refund_allocations_select()
REFUND_ALLOCATIONS_VIEW = view_table(
    "vw_metric_refund_allocations", REFUND_ALLOCATIONS_DEFINITION
)


def _metric_transactions_select(
    transactions=_transactions, allocations=REFUND_ALLOCATIONS_VIEW
) -> Select:
    received = (
        select(
            allocations.c.original_transaction_id.label("transaction_id"),
            func.sum(allocations.c.matched_amount).label("total"),
        )
        .group_by(allocations.c.original_transaction_id)
        .subquery("received_refunds")
    )
    allocated = (
        select(
            allocations.c.refund_transaction_id.label("transaction_id"),
            func.sum(allocations.c.matched_amount).label("total"),
        )
        .group_by(allocations.c.refund_transaction_id)
        .subquery("allocated_refunds")
    )
    tx = transactions
    return (
        select(
            tx.c.id.label("id"),
            tx.c.date.label("date"),
            tx.c.time.label("time"),
            month_key(tx.c.date).label("period"),
            tx.c.type.label("type"),
            tx.c.amount.label("amount"),
            tx.c.currency.label("currency"),
            func.coalesce(tx.c.category_major_user, tx.c.category_major).label(
                "effective_category_major"
            ),
            func.coalesce(tx.c.category_minor_user, tx.c.category_minor).label(
                "effective_category_minor"
            ),
            tx.c.merchant.label("merchant"),
            tx.c.description.label("description"),
            tx.c.payment_method.label("payment_method"),
            _loan_links.c.loan_account_id.label("loan_account_id"),
            _installment_links.c.installment_plan_id.label("installment_plan_id"),
            _installment_links.c.installment_number.label("installment_number"),
            func.coalesce(received.c.total, 0).label("settlement_refund_total"),
            func.coalesce(allocated.c.total, 0).label("settlement_allocated_total"),
            # Purchase-net economics (per purchase, not a cashflow actual):
            # confirmed refunds net into the purchase they were allocated to,
            # whatever their posting date; only the unallocated remainder of a
            # refund stays on the refund row.
            case(
                (
                    and_(tx.c.type == EXPENSE, tx.c.amount < 0),
                    tx.c.amount + func.coalesce(received.c.total, 0),
                ),
                (
                    and_(tx.c.type == EXPENSE, tx.c.amount > 0),
                    tx.c.amount - func.coalesce(allocated.c.total, 0),
                ),
                else_=tx.c.amount,
            ).label("purchase_net_amount"),
        )
        .select_from(
            tx.outerjoin(_loan_links, _loan_links.c.transaction_id == tx.c.id)
            .outerjoin(
                _installment_links,
                _installment_links.c.transaction_id == tx.c.id,
            )
            .outerjoin(received, received.c.transaction_id == tx.c.id)
            .outerjoin(allocated, allocated.c.transaction_id == tx.c.id)
        )
        .where(_is_effective(tx))
    )


METRIC_TRANSACTIONS_DEFINITION = _metric_transactions_select()
METRIC_TRANSACTIONS_VIEW = view_table(
    "vw_metric_transactions", METRIC_TRANSACTIONS_DEFINITION
)


def commitment_match_predicate(
    commitments,  # type: ignore[no-untyped-def]
    *,
    merchant: object,
    category_major: object,
    category_minor: object,
    on_date: object,
) -> ColumnElement[bool]:
    """A recurring commitment's rule matches a transaction (T056).

    Merchant-scope bundles need the same merchant; both scopes need the same
    effective category (major, and minor including "no minor"), and the date
    must fall in ``[start_date, end_date]`` (open ends allowed). Shared by the
    SQL view and the write-through service so membership has one definition.
    """
    return and_(
        commitments.c.category_major == category_major,
        commitments.c.category_minor.is_not_distinct_from(category_minor),
        or_(
            commitments.c.match_scope == "category",
            and_(
                commitments.c.match_scope == "merchant",
                commitments.c.merchant == merchant,
            ),
        ),
        or_(commitments.c.start_date.is_(None), commitments.c.start_date <= on_date),
        or_(commitments.c.end_date.is_(None), commitments.c.end_date >= on_date),
    )


def commitment_match_order(commitments) -> tuple[ColumnElement, ...]:  # type: ignore[no-untyped-def]
    """Merchant-scope bundles win over category-scope ones; then lowest id."""
    return (
        case((commitments.c.match_scope == "merchant", 0), else_=1),
        commitments.c.id,
    )


def category_default_predicate(
    defaults,  # type: ignore[no-untyped-def]
    *,
    category_major: object,
    category_minor: object,
) -> ColumnElement[bool]:
    """Exact (major, minor) default, or a whole-major default (minor NULL)."""
    return and_(
        defaults.c.category_major == category_major,
        or_(
            defaults.c.category_minor.is_not_distinct_from(category_minor),
            defaults.c.category_minor.is_(None),
        ),
    )


def category_default_order(defaults) -> tuple[ColumnElement, ...]:  # type: ignore[no-untyped-def]
    return (case((defaults.c.category_minor.is_(None), 1), else_=0),)


def _transaction_nature_select(transactions=METRIC_TRANSACTIONS_VIEW) -> Select:
    """Resolved payment form and adjustability per effective transaction.

    Adjustability precedence for 지출: loan/installment link (fixed protected)
    > transaction-level value > recurring-commitment value > category default
    > undecided. 수입/이체 and other types are ``not_applicable``.
    """
    tx = transactions
    overrides = _overrides
    rule = _commitments.alias("rule_commitment")
    default = _defaults.alias("category_default")
    rule_commitment = (
        select(rule.c.id)
        .where(
            commitment_match_predicate(
                rule,
                merchant=tx.c.merchant,
                category_major=tx.c.effective_category_major,
                category_minor=tx.c.effective_category_minor,
                on_date=tx.c.date,
            )
        )
        .order_by(*commitment_match_order(rule))
        .limit(1)
        .scalar_subquery()
    )
    category_default = (
        select(default.c.adjustability)
        .where(
            category_default_predicate(
                default,
                category_major=tx.c.effective_category_major,
                category_minor=tx.c.effective_category_minor,
            )
        )
        .order_by(*category_default_order(default))
        .limit(1)
        .scalar_subquery()
    )
    base = (
        select(
            tx.c.id.label("transaction_id"),
            tx.c.type,
            tx.c.date,
            tx.c.period,
            tx.c.effective_category_major,
            tx.c.effective_category_minor,
            tx.c.merchant,
            tx.c.loan_account_id,
            tx.c.installment_plan_id,
            overrides.c.adjustability.label("transaction_adjustability"),
            overrides.c.commitment_id.label("explicit_commitment_id"),
            func.coalesce(overrides.c.excluded_from_commitments, false()).label(
                "excluded_from_commitments"
            ),
            func.coalesce(overrides.c.installment_link_unconfirmed, false()).label(
                "installment_link_flag"
            ),
            func.coalesce(overrides.c.necessity_conflict, false()).label(
                "necessity_conflict"
            ),
            rule_commitment.label("rule_commitment_id"),
            category_default.label("category_default_adjustability"),
        )
        .select_from(tx.outerjoin(overrides, overrides.c.transaction_id == tx.c.id))
        .subquery("nature_base")
    )
    is_expense = base.c.type == EXPENSE
    linked = or_(
        base.c.loan_account_id.is_not(None), base.c.installment_plan_id.is_not(None)
    )
    no_membership = or_(
        not_(is_expense), linked, base.c.excluded_from_commitments == true()
    )
    staged = select(
        *base.c,
        case(
            (no_membership, null()),
            else_=func.coalesce(
                base.c.explicit_commitment_id, base.c.rule_commitment_id
            ),
        ).label("recurring_commitment_id"),
        case(
            (no_membership, null()),
            (base.c.explicit_commitment_id.is_not(None), literal("explicit")),
            (base.c.rule_commitment_id.is_not(None), literal("rule")),
            else_=null(),
        ).label("commitment_match"),
    ).subquery("nature_staged")

    commitment = _commitments.alias("member_commitment")
    is_expense = staged.c.type == EXPENSE
    commitment_kind = case(
        (not_(is_expense), null()),
        (staged.c.loan_account_id.is_not(None), literal("loan")),
        (staged.c.installment_plan_id.is_not(None), literal("installment")),
        (staged.c.recurring_commitment_id.is_not(None), literal("recurring")),
        else_=null(),
    )
    commitment_adjustability = case(
        (staged.c.recurring_commitment_id.is_(None), null()),
        else_=commitment.c.adjustability,
    )
    return select(
        staged.c.transaction_id,
        staged.c.type,
        staged.c.date,
        staged.c.period,
        staged.c.effective_category_major,
        staged.c.effective_category_minor,
        staged.c.merchant,
        staged.c.loan_account_id,
        staged.c.installment_plan_id,
        staged.c.recurring_commitment_id,
        staged.c.commitment_match,
        commitment_kind.label("commitment_kind"),
        case(
            (not_(is_expense), literal("not_applicable")),
            (commitment_kind.is_not(None), literal("committed")),
            else_=literal("ad_hoc"),
        ).label("payment_form"),
        staged.c.transaction_adjustability,
        commitment_adjustability.label("commitment_adjustability"),
        staged.c.category_default_adjustability,
        case(
            (not_(is_expense), literal("not_applicable")),
            (staged.c.loan_account_id.is_not(None), literal("protected")),
            (staged.c.installment_plan_id.is_not(None), literal("protected")),
            else_=func.coalesce(
                staged.c.transaction_adjustability,
                commitment_adjustability,
                staged.c.category_default_adjustability,
                literal("undecided"),
            ),
        ).label("adjustability"),
        case(
            (not_(is_expense), literal("not_applicable")),
            (staged.c.loan_account_id.is_not(None), literal("fixed_loan")),
            (staged.c.installment_plan_id.is_not(None), literal("fixed_installment")),
            (staged.c.transaction_adjustability.is_not(None), literal("transaction")),
            (commitment_adjustability.is_not(None), literal("commitment")),
            (
                staged.c.category_default_adjustability.is_not(None),
                literal("category_default"),
            ),
            else_=literal("none"),
        ).label("adjustability_source"),
        staged.c.excluded_from_commitments,
        case(
            (
                and_(
                    is_expense,
                    staged.c.installment_plan_id.is_(None),
                    staged.c.installment_link_flag == true(),
                ),
                true(),
            ),
            else_=false(),
        ).label("installment_link_unconfirmed"),
        staged.c.necessity_conflict,
    ).select_from(
        staged.outerjoin(
            commitment, commitment.c.id == staged.c.recurring_commitment_id
        )
    )


TRANSACTION_NATURE_DEFINITION = _transaction_nature_select()
TRANSACTION_NATURE_VIEW = view_table(
    "vw_transaction_nature", TRANSACTION_NATURE_DEFINITION
)


def transfer_rule_predicate(
    rules,  # type: ignore[no-untyped-def]
    *,
    scope: str,
    merchant: object,
    category_major: object,
    category_minor: object,
) -> ColumnElement[bool]:
    """A human transfer-purpose rule matches a transfer (T061).

    Merchant scope: the same normalized ``merchant`` (counterparty). Category
    scope: the same effective major category and either the same minor
    (including "no minor") or a whole-major rule (``category_minor`` NULL).
    Shared by the SQL view and the service so matching has one definition.
    """
    if scope == "merchant":
        return and_(rules.c.match_scope == "merchant", rules.c.merchant == merchant)
    return and_(
        rules.c.match_scope == "category",
        rules.c.category_major == category_major,
        or_(
            rules.c.category_minor.is_not_distinct_from(category_minor),
            rules.c.category_minor.is_(None),
        ),
    )


def transfer_rule_order(rules, scope: str) -> tuple[ColumnElement, ...]:  # type: ignore[no-untyped-def]
    """Exact minor before whole-major (category scope); then lowest id."""
    if scope == "merchant":
        return (rules.c.id,)
    return (case((rules.c.category_minor.is_(None), 1), else_=0), rules.c.id)


def _transfer_purpose_select() -> Select:
    """Resolved purpose per effective 이체 (T061).

    Precedence: transaction-level purpose > merchant-scope rule >
    category-scope rule > ``undecided``. Nothing is inferred: a transfer no
    human marked (directly or by a rule) stays ``undecided``.
    """
    tx = METRIC_TRANSACTIONS_VIEW
    merchant_rule = _transfer_rules.alias("merchant_rule")
    category_rule = _transfer_rules.alias("category_rule")

    def first_rule(rule, scope: str):  # type: ignore[no-untyped-def]
        return (
            select(rule.c.id)
            .where(
                transfer_rule_predicate(
                    rule,
                    scope=scope,
                    merchant=tx.c.merchant,
                    category_major=tx.c.effective_category_major,
                    category_minor=tx.c.effective_category_minor,
                )
            )
            .order_by(*transfer_rule_order(rule, scope))
            .limit(1)
            .scalar_subquery()
        )

    base = (
        select(
            tx.c.id.label("transaction_id"),
            tx.c.date,
            tx.c.period,
            tx.c.amount,
            tx.c.currency,
            tx.c.merchant,
            tx.c.description,
            tx.c.effective_category_major,
            tx.c.effective_category_minor,
            _transfer_overrides.c.purpose.label("transaction_purpose"),
            first_rule(merchant_rule, "merchant").label("merchant_rule_id"),
            first_rule(category_rule, "category").label("category_rule_id"),
        )
        .select_from(
            tx.outerjoin(
                _transfer_overrides, _transfer_overrides.c.transaction_id == tx.c.id
            )
        )
        .where(tx.c.type == TRANSFER)
        .subquery("transfer_base")
    )
    rule = _transfer_rules.alias("applied_rule")
    rule_id = func.coalesce(base.c.merchant_rule_id, base.c.category_rule_id)
    return select(
        base.c.transaction_id,
        base.c.date,
        base.c.period,
        base.c.amount,
        base.c.currency,
        base.c.merchant,
        base.c.description,
        base.c.effective_category_major,
        base.c.effective_category_minor,
        base.c.transaction_purpose,
        rule_id.label("rule_id"),
        rule.c.purpose.label("rule_purpose"),
        func.coalesce(
            base.c.transaction_purpose, rule.c.purpose, literal("undecided")
        ).label("purpose"),
        case(
            (base.c.transaction_purpose.is_not(None), literal("transaction")),
            (base.c.merchant_rule_id.is_not(None), literal("rule_merchant")),
            (base.c.category_rule_id.is_not(None), literal("rule_category")),
            else_=literal("none"),
        ).label("purpose_source"),
    ).select_from(base.outerjoin(rule, rule.c.id == rule_id))


TRANSFER_PURPOSE_DEFINITION = _transfer_purpose_select()
TRANSFER_PURPOSE_VIEW = view_table("vw_transfer_purpose", TRANSFER_PURPOSE_DEFINITION)


# Classification is read from the transaction whose meaning the line carries:
# the posting transaction itself, or the original purchase for the part of a
# refund that a confirmed settlement match allocated to it.
ATTRIBUTED_COLUMNS = (
    "effective_category_major",
    "effective_category_minor",
    "merchant",
    "description",
    "payment_method",
    "loan_account_id",
    "installment_plan_id",
)


def _flow_lines_select(
    tx=METRIC_TRANSACTIONS_VIEW,
    allocations=REFUND_ALLOCATIONS_VIEW,
    nature=TRANSACTION_NATURE_VIEW,
) -> Select:
    self_lines = (
        select(
            tx.c.id.label("transaction_id"),
            tx.c.id.label("attributed_transaction_id"),
            case(
                (tx.c.settlement_allocated_total > 0, literal("refund_remainder")),
                else_=literal("transaction"),
            ).label("line_kind"),
            tx.c.date,
            tx.c.time,
            tx.c.period,
            tx.c.type,
            tx.c.currency,
            (tx.c.amount - tx.c.settlement_allocated_total).label("amount"),
            *[tx.c[name] for name in ATTRIBUTED_COLUMNS],
        )
        .where(_is_metric_currency(tx.c.currency))
        .where(
            not_(
                and_(
                    tx.c.settlement_allocated_total > 0,
                    tx.c.amount == tx.c.settlement_allocated_total,
                )
            )
        )
    )
    refund = tx.alias("refund_tx")
    original = tx.alias("original_tx")
    allocation_lines = select(
        refund.c.id.label("transaction_id"),
        original.c.id.label("attributed_transaction_id"),
        literal("refund_allocation").label("line_kind"),
        refund.c.date,
        refund.c.time,
        refund.c.period,
        refund.c.type,
        refund.c.currency,
        allocations.c.matched_amount.label("amount"),
        *[original.c[name] for name in ATTRIBUTED_COLUMNS],
    ).select_from(
        allocations.join(
            refund, refund.c.id == allocations.c.refund_transaction_id
        ).join(original, original.c.id == allocations.c.original_transaction_id)
    )
    lines = union_all(self_lines, allocation_lines).subquery("lines")

    # Stage 1 (T056): the two axes come from vw_transaction_nature of the
    # transaction whose meaning the line carries (the original purchase for an
    # allocated refund part). Old classification columns are carried only for
    # the legacy aggregate views.
    purposes = TRANSFER_PURPOSE_VIEW
    is_expense = lines.c.type == EXPENSE
    axes = (
        select(
            *lines.c,
            case((not_(is_expense), null()), else_=nature.c.commitment_kind).label(
                "commitment_kind"
            ),
            case(
                (not_(is_expense), literal("not_applicable")),
                else_=func.coalesce(nature.c.adjustability, literal("undecided")),
            ).label("adjustability"),
            case(
                (not_(is_expense), literal("not_applicable")),
                else_=func.coalesce(nature.c.adjustability_source, literal("none")),
            ).label("adjustability_source"),
            case(
                (not_(is_expense), null()), else_=nature.c.recurring_commitment_id
            ).label("recurring_commitment_id"),
            case(
                (not_(is_expense), null()),
                (
                    nature.c.installment_link_unconfirmed == true(),
                    literal("installment_link_unconfirmed"),
                ),
                (
                    and_(
                        nature.c.necessity_conflict == true(),
                        func.coalesce(nature.c.adjustability, literal("undecided"))
                        == "undecided",
                    ),
                    literal("necessity_conflict"),
                ),
                else_=null(),
            ).label("mapping_note"),
            # T061: one human-set purpose per 이체 line (undecided when unset).
            case(
                (lines.c.type != TRANSFER, null()),
                else_=func.coalesce(purposes.c.purpose, literal("undecided")),
            ).label("transfer_purpose"),
            case(
                (lines.c.type != TRANSFER, null()),
                else_=func.coalesce(purposes.c.purpose_source, literal("none")),
            ).label("transfer_purpose_source"),
        )
        .select_from(
            lines.outerjoin(
                nature, nature.c.transaction_id == lines.c.attributed_transaction_id
            ).outerjoin(purposes, purposes.c.transaction_id == lines.c.transaction_id)
        )
        .subquery("axes")
    )

    # Stage 2: the single monthly-flow row each line lands in.
    is_expense = axes.c.type == EXPENSE
    decided = axes.c.adjustability.in_(["protected", "adjustable"])
    flow_row = case(
        (axes.c.type == INCOME, literal("income_undetermined")),
        (axes.c.type == TRANSFER, literal("transfer_undetermined")),
        (not_(is_expense), literal("other_type")),
        (axes.c.commitment_kind == "loan", literal("committed_loan")),
        (axes.c.commitment_kind == "installment", literal("committed_installment")),
        (axes.c.commitment_kind == "recurring", literal("committed_recurring")),
        (axes.c.adjustability == "protected", literal("ad_hoc_protected")),
        (axes.c.adjustability == "adjustable", literal("ad_hoc_adjustable")),
        else_=literal("undecided"),
    )
    flow_section = case(
        (axes.c.type == INCOME, literal("income")),
        (axes.c.type == TRANSFER, literal("transfer")),
        (not_(is_expense), literal("other")),
        (axes.c.commitment_kind.is_not(None), literal("committed")),
        (decided, literal("ad_hoc")),
        else_=literal("undecided"),
    )
    payment_form = case(
        (not_(is_expense), literal("not_applicable")),
        (axes.c.commitment_kind.is_not(None), literal("committed")),
        else_=literal("ad_hoc"),
    )
    return select(
        axes.c.transaction_id,
        axes.c.attributed_transaction_id,
        axes.c.line_kind,
        axes.c.date,
        axes.c.time,
        axes.c.period,
        axes.c.type,
        axes.c.currency,
        axes.c.amount,
        *[axes.c[name] for name in ATTRIBUTED_COLUMNS],
        axes.c.commitment_kind,
        payment_form.label("payment_form"),
        axes.c.adjustability,
        flow_section.label("flow_section"),
        flow_row.label("flow_row"),
        axes.c.mapping_note,
        axes.c.recurring_commitment_id,
        axes.c.adjustability_source,
        axes.c.transfer_purpose,
        axes.c.transfer_purpose_source,
    )


FLOW_LINES_DEFINITION = _flow_lines_select()
FLOW_LINES_VIEW = view_table("vw_metric_flow_lines", FLOW_LINES_DEFINITION)


def repayment_flow_lines(transaction_overrides: dict[int, dict] | None = None):
    """Read persisted flow lines, or evaluate the SAME SQL over hypothetical rows.

    Import review updates only date/amount on existing transactions. Apply those
    before lifecycle, refund validation, attribution and month/window selection;
    even an unlinked refund or a purchase outside the window can affect a loan.
    CTEs are read-only and do not change the installed views or persisted data.
    Transfer-purpose metadata cannot affect loan lines, so its view is reused.
    """
    if not transaction_overrides:
        return FLOW_LINES_VIEW
    expressions = []
    for field in _transactions.c:
        changes = {
            transaction_id: values[field.name]
            for transaction_id, values in transaction_overrides.items()
            if field.name in {"date", "amount"} and field.name in values
        }
        expressions.append(
            case(changes, value=_transactions.c.id, else_=field).label(field.name)
            if changes
            else field
        )
    transactions = select(*expressions).cte("preview_transactions")
    allocations = _refund_allocations_select(transactions).cte("preview_allocations")
    metrics = _metric_transactions_select(transactions, allocations).cte(
        "preview_metrics"
    )
    nature = _transaction_nature_select(metrics).cte("preview_nature")
    return _flow_lines_select(metrics, allocations, nature).cte("preview_flow_lines")


def loan_repayment_total(lines=FLOW_LINES_VIEW) -> ColumnElement:
    """Posting-month signed net outflow, shared with the monthly-flow summary."""
    return func.coalesce(
        func.sum(
            case(
                (
                    and_(lines.c.type == EXPENSE, lines.c.flow_row == "committed_loan"),
                    -lines.c.amount,
                ),
                else_=0,
            )
        ),
        0,
    )


def _as_of_select() -> Select:
    tx = METRIC_TRANSACTIONS_VIEW
    bounds = select(
        func.min(tx.c.date).label("first_transaction_date"),
        func.max(tx.c.date).label("transaction_as_of"),
    ).subquery("bounds")
    as_of = bounds.c.transaction_as_of
    closed = last_closed_period(as_of)

    def latest(model) -> ColumnElement:  # type: ignore[no-untyped-def]
        return select(func.max(model.snapshot_date)).scalar_subquery()

    return select(
        bounds.c.first_transaction_date,
        as_of.label("transaction_as_of"),
        case((as_of.is_(None), null()), else_=closed).label("last_closed_period"),
        case(
            (as_of.is_(None), null()),
            (month_key(as_of) == closed, null()),
            else_=month_key(as_of),
        ).label("in_progress_period"),
        latest(AssetSnapshot).label("asset_snapshot_as_of"),
        latest(Loan).label("loan_snapshot_as_of"),
        latest(Investment).label("investment_snapshot_as_of"),
        latest(InsuranceContract).label("insurance_snapshot_as_of"),
        latest(UserProfileSnapshot).label("profile_snapshot_as_of"),
        select(func.count())
        .select_from(tx)
        .where(not_(_is_metric_currency(tx.c.currency)))
        .scalar_subquery()
        .label("non_krw_transaction_count"),
    ).select_from(bounds)


AS_OF_DEFINITION = _as_of_select()
AS_OF_VIEW = view_table("vw_metric_as_of", AS_OF_DEFINITION)


def _expense_sum(condition: ColumnElement[bool] | None = None) -> ColumnElement:
    lines = FLOW_LINES_VIEW
    predicate = lines.c.type == EXPENSE
    if condition is not None:
        predicate = and_(predicate, condition)
    return func.coalesce(func.sum(case((predicate, -lines.c.amount), else_=0)), 0)


def _signed_sum(condition: ColumnElement[bool]) -> ColumnElement:
    lines = FLOW_LINES_VIEW
    return func.coalesce(func.sum(case((condition, lines.c.amount), else_=0)), 0)


def _monthly_flow_select() -> Select:
    lines = FLOW_LINES_VIEW
    return select(
        lines.c.period,
        lines.c.flow_section,
        lines.c.flow_row,
        func.coalesce(
            func.sum(
                case((lines.c.type == EXPENSE, -lines.c.amount), else_=lines.c.amount)
            ),
            0,
        ).label("amount"),
        func.coalesce(func.sum(lines.c.amount), 0).label("signed_amount"),
        func.count(lines.c.transaction_id.distinct()).label("transaction_count"),
    ).group_by(lines.c.period, lines.c.flow_section, lines.c.flow_row)


MONTHLY_FLOW_DEFINITION = _monthly_flow_select()
MONTHLY_FLOW_VIEW = view_table("vw_monthly_flow", MONTHLY_FLOW_DEFINITION)


def flow_summary_columns(lines: TableClause = FLOW_LINES_VIEW) -> list[ColumnElement]:
    """Monthly-flow totals over any set of flow lines.

    Shared by ``vw_monthly_flow_summary`` and by date-bounded reads of
    ``vw_metric_flow_lines`` so the same name always means the same formula.
    """
    is_expense = lines.c.type == EXPENSE
    income = _signed_sum(lines.c.type == INCOME)
    committed_loan = loan_repayment_total(lines)
    total_outflow = _expense_sum()
    return [
        income.label("income_total"),
        committed_loan.label("committed_loan_total"),
        _expense_sum(lines.c.flow_row == "committed_installment").label(
            "committed_installment_total"
        ),
        _expense_sum(lines.c.flow_row == "committed_recurring").label(
            "committed_recurring_total"
        ),
        _expense_sum(lines.c.flow_section == "committed").label("committed_total"),
        _expense_sum(lines.c.flow_row == "ad_hoc_protected").label(
            "ad_hoc_protected_total"
        ),
        _expense_sum(lines.c.flow_row == "ad_hoc_adjustable").label(
            "ad_hoc_adjustable_total"
        ),
        _expense_sum(lines.c.flow_row == "undecided").label("undecided_total"),
        total_outflow.label("total_outflow"),
        (total_outflow - committed_loan).label("living_spend"),
        _expense_sum(lines.c.adjustability == "adjustable").label("adjustable_spend"),
        _expense_sum(lines.c.adjustability == "protected").label("protected_spend"),
        _expense_sum(lines.c.adjustability == "undecided").label(
            "adjustability_undecided_total"
        ),
        (income - total_outflow).label("residual"),
        _signed_sum(lines.c.type == TRANSFER).label("transfer_net"),
        func.coalesce(
            func.sum(
                case((lines.c.type == TRANSFER, func.abs(lines.c.amount)), else_=0)
            ),
            0,
        ).label("transfer_activity_total"),
        _signed_sum(lines.c.flow_section == "other").label("other_type_total"),
        _signed_sum(and_(is_expense, lines.c.amount > 0)).label("refund_total"),
        func.coalesce(func.sum(lines.c.amount), 0).label("signed_total"),
        func.count(lines.c.transaction_id.distinct()).label("transaction_count"),
        # T061 잔여의 행방: transfer_net split by the human-set purpose. Signed
        # (source sign), so the two legs of a move between ledger accounts net
        # out inside their purpose instead of being counted twice.
        _signed_sum(lines.c.transfer_purpose == "investment").label(
            "transfer_investment_net"
        ),
        _signed_sum(lines.c.transfer_purpose == "savings").label(
            "transfer_savings_net"
        ),
        _signed_sum(lines.c.transfer_purpose.in_(["investment", "savings"])).label(
            "transfer_investment_savings_net"
        ),
        _signed_sum(lines.c.transfer_purpose == "internal_move").label(
            "transfer_internal_move_net"
        ),
        _signed_sum(lines.c.transfer_purpose == "undecided").label(
            "transfer_undecided_net"
        ),
        func.coalesce(
            func.sum(
                case(
                    (lines.c.transfer_purpose == "undecided", func.abs(lines.c.amount)),
                    else_=0,
                )
            ),
            0,
        ).label("transfer_undecided_activity_total"),
    ]


def _monthly_flow_summary_select() -> Select:
    lines = FLOW_LINES_VIEW
    monthly = (
        select(lines.c.period, *flow_summary_columns(lines))
        .group_by(lines.c.period)
        .subquery("monthly")
    )
    as_of = AS_OF_VIEW
    return select(
        *monthly.c,
        case(
            (monthly.c.period <= as_of.c.last_closed_period, literal("closed")),
            else_=literal("in_progress"),
        ).label("month_status"),
    ).select_from(monthly.join(as_of, true()))


MONTHLY_FLOW_SUMMARY_DEFINITION = _monthly_flow_summary_select()
MONTHLY_FLOW_SUMMARY_VIEW = view_table(
    "vw_monthly_flow_summary", MONTHLY_FLOW_SUMMARY_DEFINITION
)

SPEND_CUBE_DIMENSIONS = (
    "period",
    "effective_category_major",
    "effective_category_minor",
    "merchant",
    "payment_form",
    "commitment_kind",
    "adjustability",
    "flow_row",
)


def _spend_cube_select() -> Select:
    lines = FLOW_LINES_VIEW
    dimensions = [lines.c[name] for name in SPEND_CUBE_DIMENSIONS]
    return (
        select(
            *dimensions,
            func.coalesce(func.sum(-lines.c.amount), 0).label("amount"),
            func.coalesce(
                func.sum(case((lines.c.amount < 0, -lines.c.amount), else_=0)), 0
            ).label("charge_total"),
            func.coalesce(
                func.sum(case((lines.c.amount > 0, lines.c.amount), else_=0)), 0
            ).label("refund_total"),
            func.count(lines.c.transaction_id.distinct()).label("transaction_count"),
        )
        .where(lines.c.type == EXPENSE)
        .group_by(*dimensions)
    )


SPEND_CUBE_DEFINITION_SELECT = _spend_cube_select()
SPEND_CUBE_VIEW = view_table("vw_spend_cube", SPEND_CUBE_DEFINITION_SELECT)


def _excluded_currency_select() -> Select:
    tx = METRIC_TRANSACTIONS_VIEW
    return (
        select(
            tx.c.period,
            tx.c.currency,
            tx.c.type,
            func.coalesce(func.sum(tx.c.amount), 0).label("signed_amount"),
            func.count().label("transaction_count"),
        )
        .where(not_(_is_metric_currency(tx.c.currency)))
        .group_by(tx.c.period, tx.c.currency, tx.c.type)
    )


EXCLUDED_CURRENCY_DEFINITION = _excluded_currency_select()
EXCLUDED_CURRENCY_VIEW = view_table(
    "vw_metric_excluded_currency", EXCLUDED_CURRENCY_DEFINITION
)


@dataclass(frozen=True, slots=True)
class MetricViewDefinition:
    name: str
    definition: Select


# Creation order (dependencies first). Drop in reverse.
METRIC_VIEWS: tuple[MetricViewDefinition, ...] = (
    MetricViewDefinition("vw_metric_refund_allocations", REFUND_ALLOCATIONS_DEFINITION),
    MetricViewDefinition("vw_metric_transactions", METRIC_TRANSACTIONS_DEFINITION),
    MetricViewDefinition("vw_transaction_nature", TRANSACTION_NATURE_DEFINITION),
    MetricViewDefinition("vw_transfer_purpose", TRANSFER_PURPOSE_DEFINITION),
    MetricViewDefinition("vw_metric_flow_lines", FLOW_LINES_DEFINITION),
    MetricViewDefinition("vw_metric_as_of", AS_OF_DEFINITION),
    MetricViewDefinition("vw_monthly_flow", MONTHLY_FLOW_DEFINITION),
    MetricViewDefinition("vw_monthly_flow_summary", MONTHLY_FLOW_SUMMARY_DEFINITION),
    MetricViewDefinition("vw_spend_cube", SPEND_CUBE_DEFINITION_SELECT),
    MetricViewDefinition("vw_metric_excluded_currency", EXCLUDED_CURRENCY_DEFINITION),
)


def compile_view_sql(definition: Select, dialect: Dialect) -> str:
    return str(
        definition.compile(dialect=dialect, compile_kwargs={"literal_binds": True})
    )


def metric_view_ddl(dialect: Dialect) -> list[str]:
    """``CREATE VIEW`` statements for the metric layer in creation order."""
    return [
        f"CREATE VIEW {view.name} AS {compile_view_sql(view.definition, dialect)}"
        for view in METRIC_VIEWS
    ]
