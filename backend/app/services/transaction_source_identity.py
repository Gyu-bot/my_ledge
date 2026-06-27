from datetime import date, time
from hashlib import sha256
from typing import Final, assert_never

from app.models.transaction import Transaction
from app.parsers.transactions import TransactionRow


SOURCE_HASH_NULL_SENTINEL: Final = "<null>"

type SourceSignature = tuple[
    date,
    time,
    str,
    str,
    str | None,
    str,
    int,
    str,
    str | None,
]
type FallbackSignature = tuple[date, str, str, int, str, str | None]
type SourceHashValue = date | time | str | int | None


def source_row_hash_from_row(row: TransactionRow) -> str:
    return _build_source_row_hash(_source_signature_from_row(row))


def source_row_hash_from_transaction(transaction: Transaction) -> str:
    return _build_source_row_hash(_source_signature_from_transaction(transaction))


def fallback_signature_from_row(row: TransactionRow) -> FallbackSignature:
    return (
        row["date"],
        row["type"],
        row["description"],
        row["amount"],
        row["currency"],
        row["payment_method"],
    )


def fallback_signature_from_transaction(
    transaction: Transaction,
) -> FallbackSignature:
    return (
        transaction.date,
        transaction.type,
        transaction.description,
        transaction.amount,
        transaction.currency,
        transaction.payment_method,
    )


def seconds_since_midnight_from_row(row: TransactionRow) -> int:
    return _seconds_since_midnight(row["time"])


def seconds_since_midnight_from_transaction(transaction: Transaction) -> int:
    return _seconds_since_midnight(transaction.time)


def _build_source_row_hash(signature: SourceSignature) -> str:
    digest = sha256()
    for part in _source_hash_parts(signature):
        digest.update(part.encode("utf-8"))
        digest.update(b"\x1f")
    return digest.hexdigest()


def _source_hash_parts(signature: SourceSignature) -> tuple[str, ...]:
    return tuple(_source_hash_part(value) for value in signature)


def _source_hash_part(value: SourceHashValue) -> str:
    match value:
        case None:
            return SOURCE_HASH_NULL_SENTINEL
        case date() | time():
            return value.isoformat()
        case str() | int():
            return str(value)
        case unreachable:
            assert_never(unreachable)


def _source_signature_from_row(row: TransactionRow) -> SourceSignature:
    return (
        row["date"],
        row["time"],
        row["type"],
        row["category_major"],
        row["category_minor"],
        row["description"],
        row["amount"],
        row["currency"],
        row["payment_method"],
    )


def _source_signature_from_transaction(
    transaction: Transaction,
) -> SourceSignature:
    return (
        transaction.date,
        transaction.time,
        transaction.type,
        transaction.category_major,
        transaction.category_minor,
        transaction.description,
        transaction.amount,
        transaction.currency,
        transaction.payment_method,
    )


def _seconds_since_midnight(time_value: time) -> int:
    return time_value.hour * 3600 + time_value.minute * 60 + time_value.second
