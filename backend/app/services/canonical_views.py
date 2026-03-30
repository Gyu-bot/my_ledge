from dataclasses import dataclass

from sqlalchemy import Boolean, Date, DateTime, Integer, String, Text, Time, case, func, or_, select
from sqlalchemy.sql.elements import ColumnElement
from sqlalchemy.sql.selectable import Select

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
        Transaction.memo.is_not(None),
    )


def build_transactions_effective_select(
    *,
    include_deleted: bool = False,
    include_merged: bool = False,
) -> Select:
    query = select(
        Transaction.id.label("id"),
        Transaction.date.label("date"),
        Transaction.time.label("time"),
        Transaction.type.label("type"),
        Transaction.category_major.label("category_major"),
        Transaction.category_minor.label("category_minor"),
        Transaction.category_major_user.label("category_major_user"),
        Transaction.category_minor_user.label("category_minor_user"),
        func.coalesce(Transaction.category_major_user, Transaction.category_major).label(
            "effective_category_major"
        ),
        func.coalesce(Transaction.category_minor_user, Transaction.category_minor).label(
            "effective_category_minor"
        ),
        Transaction.description.label("description"),
        Transaction.amount.label("amount"),
        Transaction.currency.label("currency"),
        Transaction.payment_method.label("payment_method"),
        Transaction.cost_kind.label("cost_kind"),
        Transaction.fixed_cost_necessity.label("fixed_cost_necessity"),
        Transaction.memo.label("memo"),
        Transaction.is_deleted.label("is_deleted"),
        Transaction.merged_into_id.label("merged_into_id"),
        case((transaction_is_edited_clause(), True), else_=False).label("is_edited"),
        Transaction.source.label("source"),
        Transaction.created_at.label("created_at"),
        Transaction.updated_at.label("updated_at"),
    ).select_from(Transaction)
    if not include_deleted:
        query = query.where(Transaction.is_deleted.is_(False))
    if not include_merged:
        query = query.where(Transaction.merged_into_id.is_(None))
    return query


CANONICAL_VIEWS: tuple[SchemaViewDefinition, ...] = (
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
            SchemaColumnDefinition("category_major_user", String(length=50), nullable=True),
            SchemaColumnDefinition("category_minor_user", String(length=50), nullable=True),
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
            SchemaColumnDefinition("amount", Integer(), nullable=False),
            SchemaColumnDefinition("currency", String(length=5), nullable=False),
            SchemaColumnDefinition("payment_method", String(length=100), nullable=True),
            SchemaColumnDefinition("cost_kind", String(length=20), nullable=True),
            SchemaColumnDefinition("fixed_cost_necessity", String(length=20), nullable=True),
            SchemaColumnDefinition("memo", Text(), nullable=True),
            SchemaColumnDefinition("is_deleted", Boolean(), nullable=False),
            SchemaColumnDefinition("merged_into_id", Integer(), nullable=True),
            SchemaColumnDefinition("is_edited", Boolean(), nullable=False),
            SchemaColumnDefinition("source", String(length=10), nullable=False),
            SchemaColumnDefinition("created_at", DateTime(timezone=True), nullable=False),
            SchemaColumnDefinition("updated_at", DateTime(timezone=True), nullable=False),
        ),
    ),
)
