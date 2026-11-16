"""Read-only dry-run report for the T056 two-axis migration.

Usage (database URL from the environment, never printed)::

    DATABASE_URL=postgresql+asyncpg://... uv run python -m app.tools.nature_axes_migration_report
    ... --show-amounts   # also print won amounts (off by default)
    ... --json           # machine-readable output

Run it before ``alembic upgrade head`` (predicted mapping only) and after it
(predicted vs actual, conservation checks). It opens one read-only transaction
and never writes. Amount shares are percentages of the net 지출 total of
effective KRW transactions (refunds net in, as in the metric views).
"""

import argparse
import asyncio
import json
import os
import sys
from collections import Counter, defaultdict
from dataclasses import asdict, dataclass, field

from sqlalchemy import literal_column, exists, func, inspect, select, text
from sqlalchemy.ext.asyncio import AsyncConnection, create_async_engine

from app.models.installment_transaction_link import InstallmentTransactionLink
from app.models.loan_transaction_link import LoanTransactionLink
from app.models.transaction import Transaction
from app.services.metric_views import EXPENSE, FLOW_LINES_VIEW, TRANSACTION_NATURE_VIEW
from app.services.nature_axes_mapping import MAPPING_ROWS, map_legacy_classification


@dataclass
class RowStat:
    count: int = 0
    amount: int = 0


@dataclass
class NatureMigrationReport:
    migrated: bool
    effective_expense_count: int
    effective_expense_total: int
    non_effective_mapped_count: int
    mapping_rows: dict[str, RowStat]
    predicted_combinations: dict[str, RowStat]
    predicted_bundle_count: int
    predicted_bundles_with_adjustability: int
    predicted_bundles_monthly_cycle: int
    necessity_conflict_count: int
    installment_link_unconfirmed_count: int
    actual_combinations: dict[str, RowStat] = field(default_factory=dict)
    mismatches_by_mapping_row: dict[str, int] = field(default_factory=dict)
    bundles_by_origin: dict[str, int] = field(default_factory=dict)
    category_default_count: int = 0
    checks: dict[str, bool] = field(default_factory=dict)


def _combination(commitment_kind: str | None, adjustability: str) -> str:
    form = f"committed:{commitment_kind}" if commitment_kind else "ad_hoc"
    return f"{form} · {adjustability}"


def _is_effective():  # type: ignore[no-untyped-def]
    return (
        Transaction.is_deleted.is_(False),
        Transaction.merged_into_id.is_(None),
        Transaction.superseded_by_transaction_id.is_(None),
        func.coalesce(Transaction.source_lifecycle_status, "") != "superseded",
    )


async def build_report(connection: AsyncConnection) -> NatureMigrationReport:
    columns = await connection.run_sync(
        lambda conn: {c["name"] for c in inspect(conn).get_columns("transactions")}
    )
    if "cost_kind" not in columns:
        raise ValueError(
            "Legacy classification columns were retired by 20261117_0042; use /read/data-status for current classification"
        )
    loan_linked = exists().where(LoanTransactionLink.transaction_id == Transaction.id)
    installment_linked = exists().where(
        InstallmentTransactionLink.transaction_id == Transaction.id
    )
    rows = (
        (
            await connection.execute(
                select(
                    Transaction.id,
                    Transaction.date,
                    Transaction.amount,
                    Transaction.currency,
                    Transaction.merchant,
                    Transaction.is_deleted,
                    func.coalesce(
                        Transaction.category_major_user, Transaction.category_major
                    ).label("category_major"),
                    func.coalesce(
                        Transaction.category_minor_user, Transaction.category_minor
                    ).label("category_minor"),
                    literal_column("transactions.cost_kind").label("cost_kind"),
                    literal_column("transactions.fixed_cost_necessity").label(
                        "fixed_cost_necessity"
                    ),
                    literal_column("transactions.spend_necessity").label(
                        "spend_necessity"
                    ),
                    literal_column("transactions.recurring_payment_kind").label(
                        "recurring_payment_kind"
                    ),
                    loan_linked.label("loan_linked"),
                    installment_linked.label("installment_linked"),
                )
                .where(Transaction.type == EXPENSE)
                .where(Transaction.merged_into_id.is_(None))
                .where(Transaction.superseded_by_transaction_id.is_(None))
                .where(
                    func.coalesce(Transaction.source_lifecycle_status, "")
                    != "superseded"
                )
            )
        )
        .mappings()
        .all()
    )

    mapping_rows = {name: RowStat() for name in MAPPING_ROWS}
    combinations: dict[str, RowStat] = defaultdict(RowStat)
    predicted: dict[int, tuple[str, str]] = {}
    groups: dict[tuple, list[str | None]] = defaultdict(list)
    group_kinds: dict[tuple, set[str | None]] = defaultdict(set)
    conflicts = unconfirmed = non_effective = total = count = 0
    for row in rows:
        nature = map_legacy_classification(
            loan_linked=bool(row["loan_linked"]),
            installment_linked=bool(row["installment_linked"]),
            cost_kind=row["cost_kind"],
            fixed_cost_necessity=row["fixed_cost_necessity"],
            spend_necessity=row["spend_necessity"],
            recurring_payment_kind=row["recurring_payment_kind"],
        )
        if nature.commitment_kind == "recurring":
            key = (row["merchant"], row["category_major"], row["category_minor"])
            groups[key].append(nature.adjustability)
            group_kinds[key].add(row["recurring_payment_kind"])
        if bool(row["is_deleted"]) or str(row["currency"]).upper() != "KRW":
            non_effective += 1 if bool(row["is_deleted"]) else 0
            continue
        spend = -int(row["amount"])
        count += 1
        total += spend
        mapping_rows[nature.mapping_row].count += 1
        mapping_rows[nature.mapping_row].amount += spend
        combo = _combination(nature.commitment_kind, nature.resolved_adjustability)
        combinations[combo].count += 1
        combinations[combo].amount += spend
        predicted[int(row["id"])] = (nature.mapping_row, combo)
        conflicts += nature.necessity_conflict
        unconfirmed += nature.installment_link_unconfirmed

    report = NatureMigrationReport(
        migrated=False,
        effective_expense_count=count,
        effective_expense_total=total,
        non_effective_mapped_count=non_effective,
        mapping_rows=mapping_rows,
        predicted_combinations=dict(combinations),
        predicted_bundle_count=len(groups),
        predicted_bundles_with_adjustability=sum(
            1 for values in groups.values() if len(set(values)) == 1 and values[0]
        ),
        predicted_bundles_monthly_cycle=sum(
            1 for kinds in group_kinds.values() if kinds == {"monthly_recurring"}
        ),
        necessity_conflict_count=conflicts,
        installment_link_unconfirmed_count=unconfirmed,
    )
    report.checks["predicted_conservation"] = (
        sum(stat.count for stat in mapping_rows.values()) == count
        and sum(stat.amount for stat in mapping_rows.values()) == total
        and sum(stat.count for stat in combinations.values()) == count
        and sum(stat.amount for stat in combinations.values()) == total
    )

    views = await connection.run_sync(lambda sync: inspect(sync).get_view_names())
    if "vw_transaction_nature" not in views:
        return report
    report.migrated = True
    nature_view = TRANSACTION_NATURE_VIEW
    actual = (
        await connection.execute(
            select(
                nature_view.c.transaction_id,
                nature_view.c.commitment_kind,
                nature_view.c.adjustability,
                Transaction.amount,
            )
            .join(Transaction, Transaction.id == nature_view.c.transaction_id)
            .where(nature_view.c.type == EXPENSE)
            .where(func.upper(Transaction.currency) == "KRW")
        )
    ).all()
    seen = Counter(int(row.transaction_id) for row in actual)
    actual_combinations: dict[str, RowStat] = defaultdict(RowStat)
    mismatches: Counter[str] = Counter()
    for row in actual:
        combo = _combination(row.commitment_kind, row.adjustability)
        actual_combinations[combo].count += 1
        actual_combinations[combo].amount += -int(row.amount)
        expected = predicted.get(int(row.transaction_id))
        if expected is not None and expected[1] != combo:
            mismatches[expected[0]] += 1
    report.actual_combinations = dict(actual_combinations)
    report.mismatches_by_mapping_row = dict(mismatches)
    report.bundles_by_origin = {
        str(origin): int(n)
        for origin, n in (
            await connection.execute(
                text(
                    "SELECT origin, count(*) FROM recurring_commitments GROUP BY origin"
                )
            )
        ).all()
    }
    report.category_default_count = int(
        await connection.scalar(
            text("SELECT count(*) FROM category_adjustability_defaults")
        )
        or 0
    )
    lines = FLOW_LINES_VIEW
    flow_total = await connection.scalar(
        select(func.coalesce(func.sum(-lines.c.amount), 0)).where(
            lines.c.type == EXPENSE
        )
    )
    report.checks.update(
        {
            "every_expense_in_exactly_one_combination": set(seen) == set(predicted)
            and all(n == 1 for n in seen.values()),
            "actual_total_unchanged": sum(
                stat.amount for stat in actual_combinations.values()
            )
            == total,
            "flow_lines_total_unchanged": int(flow_total or 0) == total,
        }
    )
    return report


def _share(amount: int, total: int) -> str:
    return "n/a" if total == 0 else f"{amount / total * 100:6.2f}%"


def format_report(report: NatureMigrationReport, *, show_amounts: bool) -> str:
    total = report.effective_expense_total
    out = [
        "T056 two-axis migration report (read-only)",
        f"state: {'migrated (after)' if report.migrated else 'not migrated (before)'}",
        f"effective KRW 지출 transactions: {report.effective_expense_count}"
        + (f", net total {total:,} KRW" if show_amounts else ""),
        f"deleted 지출 rows also mapped (restorable, not in totals): "
        f"{report.non_effective_mapped_count}",
        "",
        "mapping row                         count    share"
        + ("   amount" if show_amounts else ""),
    ]

    def line(name: str, stat: RowStat) -> str:
        return f"  {name:<32} {stat.count:>6}  {_share(stat.amount, total)}" + (
            f"  {stat.amount:,}" if show_amounts else ""
        )

    out += [line(name, stat) for name, stat in report.mapping_rows.items()]
    out += ["", "predicted new-axis combination"]
    out += [line(k, v) for k, v in sorted(report.predicted_combinations.items())]
    out += [
        "",
        f"recurring bundles the migration creates: {report.predicted_bundle_count} "
        f"(with a unanimous adjustability: {report.predicted_bundles_with_adjustability}, "
        f"cycle monthly: {report.predicted_bundles_monthly_cycle})",
        f"necessity disagreement rows (stay 미정): {report.necessity_conflict_count}",
        f"installment kind without plan link (연결 미확인): "
        f"{report.installment_link_unconfirmed_count}",
    ]
    if report.migrated:
        out += ["", "actual new-axis combination (vw_transaction_nature)"]
        out += [line(k, v) for k, v in sorted(report.actual_combinations.items())]
        out += [
            "",
            f"bundles by origin: {report.bundles_by_origin}",
            f"category defaults: {report.category_default_count}",
            "rows whose actual combination differs from the mapping "
            f"(later human edits or bundle changes): {report.mismatches_by_mapping_row or 0}",
        ]
    out += ["", "checks:"]
    out += [
        f"  {name}: {'OK' if ok else 'FAILED'}" for name, ok in report.checks.items()
    ]
    return "\n".join(out)


async def _run(url: str) -> NatureMigrationReport:
    engine = create_async_engine(url)
    try:
        async with engine.connect() as connection:
            if connection.dialect.name == "postgresql":
                await connection.execute(text("SET TRANSACTION READ ONLY"))
            report = await build_report(connection)
            await connection.rollback()
            return report
    finally:
        await engine.dispose()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--show-amounts", action="store_true")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args(argv)
    url = os.environ.get("DATABASE_URL")
    if not url:
        print("DATABASE_URL is not set", file=sys.stderr)
        return 2
    try:
        report = asyncio.run(_run(url))
    except ValueError as exc:
        print(str(exc), file=sys.stderr)
        return 2
    if args.json:
        payload = asdict(report)
        if not args.show_amounts:
            for section in (
                "mapping_rows",
                "predicted_combinations",
                "actual_combinations",
            ):
                for stat in payload[section].values():
                    amount = stat.pop("amount")
                    stat["share"] = (
                        None
                        if report.effective_expense_total == 0
                        else round(amount / report.effective_expense_total, 6)
                    )
            payload.pop("effective_expense_total")
        print(json.dumps(payload, ensure_ascii=False, indent=2))
    else:
        print(format_report(report, show_amounts=args.show_amounts))
    return 0 if all(report.checks.values()) else 1


if __name__ == "__main__":
    raise SystemExit(main())
