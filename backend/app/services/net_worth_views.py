"""Snapshot-side views for the 재무상태 reconciliation (T061, plan 2.5 and 2.7).

- ``vw_net_worth_snapshots``: one row per asset snapshot date. ``net_worth`` =
  non-negative asset rows − liability rows, the same definition as
  ``/assets/snapshots``, ``/assets/net-worth-history`` and
  ``vw_asset_snapshot_canonical`` (negative asset rows are excluded and shown
  separately). ``cash_like_total`` uses exactly the cash-equivalent rule of
  ``vw_asset_snapshot_canonical.cash_equivalent_total``; the part decided only
  by the name rule (no human liquidity metadata on the row) is split out as
  ``cash_like_name_rule_total``.
- ``vw_snapshot_kind_totals``: one row per (kind, snapshot date) for the
  ``loans`` (sum of ``balance``) and ``investments`` (sum of ``market_value``)
  snapshots, with the count of rows whose value is missing.

Snapshot kinds keep their own dates; nothing here aligns or merges them. The
PostgreSQL views are created by migration 20261116_0039 from a frozen compile
of these definitions (``tests/migrations`` guards drift).
"""

from sqlalchemy import Integer, and_, case, func, literal, not_, or_, select, union_all
from sqlalchemy.sql.elements import ColumnElement
from sqlalchemy.sql.selectable import Select

from app.models.asset_snapshot import AssetSnapshot
from app.models.investment import Investment
from app.models.loan import Loan
from app.services.metric_views import MetricViewDefinition, view_table

NET_WORTH_DEFINITION = "net_worth_snapshot.v1"

_assets = AssetSnapshot.__table__
_loans = Loan.__table__
_investments = Investment.__table__

# Same markers and precedence as vw_asset_snapshot_canonical (migration 0025).
_LOCKED_MARKERS = ("부동산", "전세", "보증금", "연금", "보험", "청약", "저금통")
_CATEGORY_CASH_MARKERS = ("현금", "예금", "자유입출금", "전자금융")
_PRODUCT_CASH_MARKERS = ("입출금", "CMA", "파킹", "보통예금", "통장")
_HUMAN_CASH_TIERS = ("immediate", "cash", "cash_equivalent")


def _contains_any(column, markers: tuple[str, ...]) -> ColumnElement[bool]:  # type: ignore[no-untyped-def]
    return or_(*[column.ilike(f"%{marker}%") for marker in markers])


def _human_flag_cash() -> ColumnElement[bool]:
    return or_(
        _assets.c.is_cash_equivalent.is_(True),
        _assets.c.liquidity_tier.in_(_HUMAN_CASH_TIERS),
    )


def _name_rule_cash() -> ColumnElement[bool]:
    return and_(
        _assets.c.is_cash_equivalent.is_(None),
        _assets.c.liquidity_tier.is_(None),
        not_(
            or_(
                _contains_any(_assets.c.category, _LOCKED_MARKERS),
                _contains_any(_assets.c.product_name, _LOCKED_MARKERS),
            )
        ),
        or_(
            _contains_any(_assets.c.category, _CATEGORY_CASH_MARKERS),
            _contains_any(_assets.c.product_name, _PRODUCT_CASH_MARKERS),
        ),
    )


def _sum_where(condition: ColumnElement[bool], value) -> ColumnElement:  # type: ignore[no-untyped-def]
    return func.coalesce(func.sum(case((condition, value), else_=0)), 0)


def _net_worth_snapshots_select() -> Select:
    countable_asset = and_(_assets.c.side == "asset", _assets.c.amount >= 0)
    asset_total = _sum_where(countable_asset, _assets.c.amount)
    liability_total = _sum_where(_assets.c.side == "liability", _assets.c.amount)
    return select(
        _assets.c.snapshot_date,
        asset_total.label("asset_total"),
        liability_total.label("liability_total"),
        (asset_total - liability_total).label("net_worth"),
        _sum_where(
            and_(_assets.c.side == "asset", _assets.c.amount < 0), _assets.c.amount
        ).label("negative_asset_excluded_total"),
        _sum_where(
            and_(countable_asset, or_(_human_flag_cash(), _name_rule_cash())),
            _assets.c.amount,
        ).label("cash_like_total"),
        _sum_where(and_(countable_asset, _name_rule_cash()), _assets.c.amount).label(
            "cash_like_name_rule_total"
        ),
        func.count().label("asset_row_count"),
    ).group_by(_assets.c.snapshot_date)


NET_WORTH_SNAPSHOTS_DEFINITION = _net_worth_snapshots_select()
NET_WORTH_SNAPSHOTS_VIEW = view_table(
    "vw_net_worth_snapshots", NET_WORTH_SNAPSHOTS_DEFINITION
)


def _kind_totals(kind: str, table, value_column) -> Select:  # type: ignore[no-untyped-def]
    return select(
        literal(kind).label("kind"),
        table.c.snapshot_date.label("snapshot_date"),
        func.coalesce(func.sum(value_column), 0).label("value_total"),
        func.count().label("row_count"),
        (func.count() - func.count(value_column))
        .cast(Integer)
        .label("missing_value_row_count"),
    ).group_by(table.c.snapshot_date)


def _snapshot_kind_totals_select() -> Select:
    combined = union_all(
        _kind_totals("loans", _loans, _loans.c.balance),
        _kind_totals("investments", _investments, _investments.c.market_value),
    ).subquery("kind_totals")
    return select(
        combined.c.kind,
        combined.c.snapshot_date,
        combined.c.value_total,
        combined.c.row_count,
        combined.c.missing_value_row_count,
    )


SNAPSHOT_KIND_TOTALS_DEFINITION = _snapshot_kind_totals_select()
SNAPSHOT_KIND_TOTALS_VIEW = view_table(
    "vw_snapshot_kind_totals", SNAPSHOT_KIND_TOTALS_DEFINITION
)

# Creation order. They read base tables only, independent of the metric chain.
NET_WORTH_VIEWS: tuple[MetricViewDefinition, ...] = (
    MetricViewDefinition("vw_net_worth_snapshots", NET_WORTH_SNAPSHOTS_DEFINITION),
    MetricViewDefinition("vw_snapshot_kind_totals", SNAPSHOT_KIND_TOTALS_DEFINITION),
)

NET_WORTH_VIEW_DESCRIPTIONS = {
    "vw_net_worth_snapshots": (
        "T061 net worth per asset snapshot date: asset_total (non-negative asset "
        "rows), liability_total, net_worth = asset_total − liability_total (same "
        "as /assets/snapshots), negative_asset_excluded_total, cash_like_total "
        "(same rule as vw_asset_snapshot_canonical.cash_equivalent_total) and "
        "cash_like_name_rule_total (the part judged only by the name rule)."
    ),
    "vw_snapshot_kind_totals": (
        "T061 per-kind snapshot totals: kind=loans (sum of balance) or "
        "investments (sum of market_value) per snapshot_date with row_count and "
        "missing_value_row_count. Kinds keep their own dates; never merged."
    ),
}


def net_worth_view_ddl(dialect) -> list[str]:  # type: ignore[no-untyped-def]
    from app.services.metric_views import compile_view_sql

    return [
        f"CREATE VIEW {view.name} AS {compile_view_sql(view.definition, dialect)}"
        for view in NET_WORTH_VIEWS
    ]
