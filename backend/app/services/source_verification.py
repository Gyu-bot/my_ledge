from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from io import BytesIO
import random

from openpyxl import load_workbook
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.asset_snapshot import AssetSnapshot
from app.models.investment import Investment
from app.models.loan import Loan
from app.models.transaction import Transaction
from app.parsers.snapshots import parse_snapshots
from app.parsers.transactions import TransactionRow, parse_transactions
from app.services.upload_service import (
    _seconds_since_midnight,
    _transaction_fallback_signature,
)
from app.services.upload_service import normalize_snapshots_for_storage


@dataclass(slots=True)
class TransactionParityReport:
    total_rows: int
    db_rows: int
    sample_size: int
    sample_seed: int
    sampled_indices: list[int]
    missing_sample_indices: list[int]


@dataclass(slots=True)
class SnapshotSectionParityReport:
    expected_rows: int
    db_rows: int
    missing_rows: list[dict[str, object]]
    extra_rows: list[dict[str, object]]


@dataclass(slots=True)
class SnapshotParityReport:
    asset_snapshots: SnapshotSectionParityReport
    investments: SnapshotSectionParityReport
    loans: SnapshotSectionParityReport


@dataclass(slots=True)
class CashflowBenchmarkMismatch:
    period: str
    transaction_type: str
    category_major: str
    expected_amount: Decimal
    db_amount: Decimal
    delta: Decimal


@dataclass(slots=True)
class CashflowBenchmarkParityReport:
    expected_rows: int
    compared_rows: int
    mismatches: list[CashflowBenchmarkMismatch]


@dataclass(slots=True)
class ImportParityReport:
    transaction: TransactionParityReport
    snapshots: SnapshotParityReport
    cashflow_benchmarks: CashflowBenchmarkParityReport


async def verify_import_parity(
    db_session: AsyncSession,
    workbook_bytes: bytes,
    snapshot_date: date,
    transaction_sample_size: int = 10,
    transaction_sample_seed: int = 20260324,
) -> ImportParityReport:
    workbook = load_workbook(BytesIO(workbook_bytes), data_only=True)
    parsed_transactions = parse_transactions(workbook)
    parsed_snapshots = normalize_snapshots_for_storage(parse_snapshots(workbook))

    return ImportParityReport(
        transaction=await _verify_transaction_parity(
            db_session=db_session,
            parsed_transactions=parsed_transactions,
            sample_size=transaction_sample_size,
            sample_seed=transaction_sample_seed,
        ),
        snapshots=SnapshotParityReport(
            asset_snapshots=await _verify_asset_snapshot_parity(
                db_session,
                parsed_snapshots.asset_snapshots,
                snapshot_date,
            ),
            investments=await _verify_investment_parity(
                db_session,
                parsed_snapshots.investments,
                snapshot_date,
            ),
            loans=await _verify_loan_parity(
                db_session,
                parsed_snapshots.loans,
                snapshot_date,
            ),
        ),
        cashflow_benchmarks=await _verify_cashflow_benchmark_parity(
            db_session,
            parsed_snapshots.cashflow_benchmarks,
        ),
    )


async def _verify_transaction_parity(
    db_session: AsyncSession,
    parsed_transactions: list[TransactionRow],
    sample_size: int,
    sample_seed: int,
) -> TransactionParityReport:
    db_rows = (
        await db_session.scalar(select(func.count()).select_from(Transaction)) or 0
    )
    sampled_indices = sorted(
        random.Random(sample_seed).sample(
            range(len(parsed_transactions)),
            k=min(sample_size, len(parsed_transactions)),
        )
    )
    missing_sample_indices: list[int] = []
    for index in sampled_indices:
        row = parsed_transactions[index]
        if not await _row_exists_exactly(db_session, row):
            if await _row_exists_by_import_fallback(db_session, row):
                continue
            missing_sample_indices.append(index)

    return TransactionParityReport(
        total_rows=len(parsed_transactions),
        db_rows=int(db_rows),
        sample_size=min(sample_size, len(parsed_transactions)),
        sample_seed=sample_seed,
        sampled_indices=sampled_indices,
        missing_sample_indices=missing_sample_indices,
    )


async def _row_exists_exactly(
    db_session: AsyncSession,
    row: TransactionRow,
) -> bool:
    exists = await db_session.scalar(
        select(func.count())
        .select_from(Transaction)
        .where(Transaction.date == row["date"])
        .where(Transaction.time == row["time"])
        .where(Transaction.type == row["type"])
        .where(Transaction.category_major == row["category_major"])
        .where(
            Transaction.category_minor.is_(row["category_minor"])
            if row["category_minor"] is None
            else Transaction.category_minor == row["category_minor"]
        )
        .where(Transaction.description == row["description"])
        .where(Transaction.amount == row["amount"])
        .where(Transaction.currency == row["currency"])
        .where(
            Transaction.payment_method.is_(row["payment_method"])
            if row["payment_method"] is None
            else Transaction.payment_method == row["payment_method"]
        )
        .where(
            Transaction.memo.is_(row["memo"])
            if row["memo"] is None
            else Transaction.memo == row["memo"]
        )
    )
    return bool(exists)


async def _row_exists_by_import_fallback(
    db_session: AsyncSession,
    row: TransactionRow,
) -> bool:
    fallback_signature = _transaction_fallback_signature(row)
    result = await db_session.execute(
        select(Transaction)
        .where(Transaction.date == fallback_signature[0])
        .where(Transaction.type == fallback_signature[1])
        .where(Transaction.description == fallback_signature[2])
        .where(Transaction.amount == fallback_signature[3])
        .where(Transaction.currency == fallback_signature[4])
        .where(
            Transaction.payment_method.is_(fallback_signature[5])
            if fallback_signature[5] is None
            else Transaction.payment_method == fallback_signature[5]
        )
    )
    row_seconds = _seconds_since_midnight(row)
    for candidate in result.scalars().all():
        if abs(_seconds_since_midnight(candidate) - row_seconds) <= 60:
            return True
    return False


async def _verify_asset_snapshot_parity(
    db_session: AsyncSession,
    expected_rows: list[dict[str, object]],
    snapshot_date: date,
) -> SnapshotSectionParityReport:
    result = await db_session.execute(
        select(AssetSnapshot).where(AssetSnapshot.snapshot_date == snapshot_date)
    )
    actual_rows = [_serialize_asset_snapshot(row) for row in result.scalars().all()]
    expected_serialized = [
        _serialize_expected_asset_snapshot(row) for row in expected_rows
    ]
    return _build_snapshot_report(expected_serialized, actual_rows)


async def _verify_investment_parity(
    db_session: AsyncSession,
    expected_rows: list[dict[str, object]],
    snapshot_date: date,
) -> SnapshotSectionParityReport:
    result = await db_session.execute(
        select(Investment).where(Investment.snapshot_date == snapshot_date)
    )
    actual_rows = [_serialize_investment(row) for row in result.scalars().all()]
    expected_serialized = [_serialize_expected_investment(row) for row in expected_rows]
    return _build_snapshot_report(expected_serialized, actual_rows)


async def _verify_loan_parity(
    db_session: AsyncSession,
    expected_rows: list[dict[str, object]],
    snapshot_date: date,
) -> SnapshotSectionParityReport:
    result = await db_session.execute(
        select(Loan).where(Loan.snapshot_date == snapshot_date)
    )
    actual_rows = [_serialize_loan(row) for row in result.scalars().all()]
    expected_serialized = [_serialize_expected_loan(row) for row in expected_rows]
    return _build_snapshot_report(expected_serialized, actual_rows)


async def _verify_cashflow_benchmark_parity(
    db_session: AsyncSession,
    expected_rows: list[dict[str, object]],
) -> CashflowBenchmarkParityReport:
    if not expected_rows:
        return CashflowBenchmarkParityReport(
            expected_rows=0,
            compared_rows=0,
            mismatches=[],
        )

    periods = sorted({str(row["period"]) for row in expected_rows})
    start_date = _period_start(periods[0])
    end_date = _period_end(periods[-1])
    result = await db_session.execute(
        select(Transaction)
        .where(Transaction.date >= start_date)
        .where(Transaction.date <= end_date)
        .where(Transaction.type.in_(["수입", "지출"]))
        .where(Transaction.is_deleted.is_(False))
        .where(Transaction.merged_into_id.is_(None))
    )
    actual_by_key: dict[tuple[str, str, str], Decimal] = {}
    for row in result.scalars().all():
        period = f"{row.date:%Y-%m}"
        category_major = row.category_major_user or row.category_major or "미분류"
        key = (period, row.type, category_major)
        amount = Decimal(row.amount)
        if row.type == "지출":
            amount = abs(amount)
        actual_by_key[key] = actual_by_key.get(key, Decimal("0")) + amount

    mismatches: list[CashflowBenchmarkMismatch] = []
    for row in expected_rows:
        key = (
            str(row["period"]),
            str(row["transaction_type"]),
            str(row["category_major"]),
        )
        expected_amount = Decimal(row["amount"])
        db_amount = actual_by_key.get(key, Decimal("0"))
        if db_amount != expected_amount:
            mismatches.append(
                CashflowBenchmarkMismatch(
                    period=key[0],
                    transaction_type=key[1],
                    category_major=key[2],
                    expected_amount=expected_amount,
                    db_amount=db_amount,
                    delta=db_amount - expected_amount,
                )
            )

    return CashflowBenchmarkParityReport(
        expected_rows=len(expected_rows),
        compared_rows=len(expected_rows),
        mismatches=mismatches,
    )


def _build_snapshot_report(
    expected_rows: list[dict[str, object]],
    actual_rows: list[dict[str, object]],
) -> SnapshotSectionParityReport:
    expected_counter = Counter(_freeze_row(row) for row in expected_rows)
    actual_counter = Counter(_freeze_row(row) for row in actual_rows)

    missing_rows = _expand_counter(expected_counter - actual_counter)
    extra_rows = _expand_counter(actual_counter - expected_counter)

    return SnapshotSectionParityReport(
        expected_rows=len(expected_rows),
        db_rows=len(actual_rows),
        missing_rows=missing_rows,
        extra_rows=extra_rows,
    )


def _freeze_row(row: dict[str, object]) -> tuple[tuple[str, object], ...]:
    return tuple(sorted(row.items()))


def _expand_counter(
    counter: Counter[tuple[tuple[str, object], ...]],
) -> list[dict[str, object]]:
    expanded: list[dict[str, object]] = []
    for frozen_row, count in counter.items():
        row = dict(frozen_row)
        for _ in range(count):
            expanded.append(row)
    return expanded


def _serialize_expected_asset_snapshot(row: dict[str, object]) -> dict[str, object]:
    return {
        "side": row["side"],
        "category": row["category"],
        "product_name": row["product_name"],
        "amount": _quantize_decimal(row["amount"], "0.01"),
    }


def _serialize_asset_snapshot(row: AssetSnapshot) -> dict[str, object]:
    return {
        "side": row.side,
        "category": row.category,
        "product_name": row.product_name,
        "amount": _quantize_decimal(row.amount, "0.01"),
    }


def _serialize_expected_investment(row: dict[str, object]) -> dict[str, object]:
    return {
        "product_type": row["product_type"],
        "broker": row["broker"],
        "product_name": row["product_name"],
        "cost_basis": _quantize_optional_decimal(row["cost_basis"], "0.01"),
        "market_value": _quantize_optional_decimal(row["market_value"], "0.01"),
        "return_rate": _quantize_optional_decimal(row["return_rate"], "0.0001"),
    }


def _serialize_investment(row: Investment) -> dict[str, object]:
    return {
        "product_type": row.product_type,
        "broker": row.broker,
        "product_name": row.product_name,
        "cost_basis": _quantize_optional_decimal(row.cost_basis, "0.01"),
        "market_value": _quantize_optional_decimal(row.market_value, "0.01"),
        "return_rate": _quantize_optional_decimal(row.return_rate, "0.0001"),
    }


def _serialize_expected_loan(row: dict[str, object]) -> dict[str, object]:
    return {
        "loan_type": row["loan_type"],
        "lender": row["lender"],
        "product_name": row["product_name"],
        "principal": _quantize_optional_decimal(row["principal"], "0.01"),
        "balance": _quantize_optional_decimal(row["balance"], "0.01"),
        "interest_rate": _quantize_optional_decimal(row["interest_rate"], "0.01"),
        "start_date": row["start_date"],
        "maturity_date": row["maturity_date"],
    }


def _serialize_loan(row: Loan) -> dict[str, object]:
    return {
        "loan_type": row.loan_type,
        "lender": row.lender,
        "product_name": row.product_name,
        "principal": _quantize_optional_decimal(row.principal, "0.01"),
        "balance": _quantize_optional_decimal(row.balance, "0.01"),
        "interest_rate": _quantize_optional_decimal(row.interest_rate, "0.01"),
        "start_date": row.start_date,
        "maturity_date": row.maturity_date,
    }


def _quantize_optional_decimal(value: Decimal | None, pattern: str) -> Decimal | None:
    if value is None:
        return None
    return _quantize_decimal(value, pattern)


def _quantize_decimal(value: Decimal, pattern: str) -> Decimal:
    return Decimal(value).quantize(Decimal(pattern))


def _period_start(period: str) -> date:
    year, month = [int(part) for part in period.split("-")]
    return date(year, month, 1)


def _period_end(period: str) -> date:
    year, month = [int(part) for part in period.split("-")]
    if month == 12:
        return date(year, 12, 31)
    return date(year, month + 1, 1).replace(day=1) - date.resolution
