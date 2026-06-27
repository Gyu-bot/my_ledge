from datetime import date, time as time_type

from app.models.transaction import Transaction
from app.parsers.transactions import TransactionRow
from app.services import transaction_source_identity as source_identity
from app.services import transaction_source_lifecycle_service as lifecycle_service


type ReplacementSignature = tuple[date, str, int, str, str | None]


def available_fallback_candidates(
    fallback_buckets: dict[source_identity.FallbackSignature, list[Transaction]],
    row: TransactionRow,
    reserved_existing_ids: set[int],
) -> list[Transaction]:
    row_seconds = seconds_since_midnight(row["time"])
    return [
        candidate
        for candidate in available_candidates(
            fallback_buckets.get(source_identity.fallback_signature_from_row(row), []),
            reserved_existing_ids,
        )
        if abs(seconds_since_midnight(candidate.time) - row_seconds)
        <= lifecycle_service.SOURCE_CHANGED_MATCH_SECONDS
    ]


def available_candidates(
    candidates: list[Transaction],
    reserved_existing_ids: set[int],
) -> list[Transaction]:
    return [
        candidate for candidate in candidates if candidate.id not in reserved_existing_ids
    ]


def build_exact_hash_buckets(
    existing_rows: list[Transaction],
) -> dict[str, list[Transaction]]:
    buckets: dict[str, list[Transaction]] = {}
    for row in existing_rows:
        buckets.setdefault(
            source_identity.source_row_hash_from_transaction(row),
            [],
        ).append(row)
    return buckets


def build_fallback_buckets(
    existing_rows: list[Transaction],
) -> dict[source_identity.FallbackSignature, list[Transaction]]:
    buckets: dict[source_identity.FallbackSignature, list[Transaction]] = {}
    for row in existing_rows:
        buckets.setdefault(
            source_identity.fallback_signature_from_transaction(row),
            [],
        ).append(row)
    return buckets


def build_replacement_buckets(
    existing_rows: list[Transaction],
) -> dict[ReplacementSignature, list[Transaction]]:
    buckets: dict[ReplacementSignature, list[Transaction]] = {}
    for row in existing_rows:
        buckets.setdefault(replacement_signature_from_transaction(row), []).append(row)
    return buckets


def replacement_signature_from_row(row: TransactionRow) -> ReplacementSignature:
    return (
        row["date"],
        row["type"],
        row["amount"],
        row["currency"],
        row["payment_method"],
    )


def replacement_signature_from_transaction(
    transaction: Transaction,
) -> ReplacementSignature:
    return (
        transaction.date,
        transaction.type,
        transaction.amount,
        transaction.currency,
        transaction.payment_method,
    )


def seconds_since_midnight(time_value: time_type) -> int:
    return time_value.hour * 3600 + time_value.minute * 60 + time_value.second
