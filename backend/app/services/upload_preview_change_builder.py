from collections import Counter

from app.models.transaction import Transaction
from app.parsers.transactions import TransactionRow
from app.services.transaction_source_lifecycle_service import (
    SOURCE_CHANGED_MATCH_SECONDS,
)
from app.services.upload_preview_models import SOURCE_FIELD_NAMES
from app.services.upload_preview_models import UploadPreviewChangeCounts
from app.services.upload_preview_models import UploadPreviewChangeData
from app.services.upload_preview_models import UploadPreviewFieldDeltaData
from app.services.upload_preview_models import UploadPreviewSourceData
from app.services.upload_preview_models import UploadPreviewChangeTypeValue


def build_change(
    *,
    change_type: UploadPreviewChangeTypeValue,
    review_required: bool,
    reason: str,
    row_hash: str | None,
    existing: Transaction | None,
    incoming: TransactionRow | None,
    candidate_ids: tuple[int, ...],
) -> UploadPreviewChangeData:
    preserved_user_fields = preserved_user_fields_from_transaction(existing)
    return UploadPreviewChangeData(
        change_type=change_type,
        review_required=review_required,
        auto_apply_safe=not review_required,
        reason=reason,
        source_row_hash=row_hash,
        existing_transaction_id=existing.id if existing is not None else None,
        candidate_transaction_ids=candidate_ids,
        existing_source=source_from_transaction(existing),
        incoming_source=source_from_row(incoming),
        field_changes=field_changes(existing, incoming),
        preserved_user_fields=preserved_user_fields,
        preservation_summary=preservation_summary(
            preserved_user_fields,
            review_required,
        ),
    )


def build_matched_safe_change(
    existing: Transaction,
    incoming: TransactionRow,
    row_hash: str,
) -> UploadPreviewChangeData:
    changed_fields = {change.field for change in field_changes(existing, incoming)}
    change_type: UploadPreviewChangeTypeValue = "source_fields_changed"
    reason = (
        f"Matched on fallback signature within {SOURCE_CHANGED_MATCH_SECONDS} seconds "
        "and source-managed fields changed."
    )
    if changed_fields == {"time"}:
        change_type = "time_shifted"
        reason = (
            f"Matched on fallback signature and only time shifted within "
            f"{SOURCE_CHANGED_MATCH_SECONDS} seconds."
        )
    return build_change(
        change_type=change_type,
        review_required=False,
        reason=reason,
        row_hash=row_hash,
        existing=existing,
        incoming=incoming,
        candidate_ids=(existing.id,),
    )


def build_ambiguous_change(
    row: TransactionRow,
    row_hash: str,
    candidates: list[Transaction],
) -> UploadPreviewChangeData:
    return build_change(
        change_type="ambiguous",
        review_required=True,
        reason="Multiple imported transactions could match the incoming source row.",
        row_hash=row_hash,
        existing=None,
        incoming=row,
        candidate_ids=tuple(candidate.id for candidate in candidates),
    )


def build_duplicate_change(
    row: TransactionRow,
    row_hash: str,
    candidates: list[Transaction],
    reason: str,
) -> UploadPreviewChangeData:
    return build_change(
        change_type="possible_duplicate",
        review_required=True,
        reason=reason,
        row_hash=row_hash,
        existing=None,
        incoming=row,
        candidate_ids=tuple(candidate.id for candidate in candidates),
    )


def build_change_counts(
    changes: tuple[UploadPreviewChangeData, ...],
) -> UploadPreviewChangeCounts:
    counts = Counter(change.change_type for change in changes)
    return UploadPreviewChangeCounts(
        new=counts["new"],
        unchanged=counts["unchanged"],
        source_fields_changed=counts["source_fields_changed"],
        time_shifted=counts["time_shifted"],
        possible_replacement=counts["possible_replacement"],
        missing_from_latest_export=counts["missing_from_latest_export"],
        possible_duplicate=counts["possible_duplicate"],
        ambiguous=counts["ambiguous"],
    )


def source_from_row(row: TransactionRow | None) -> UploadPreviewSourceData | None:
    if row is None:
        return None
    return UploadPreviewSourceData(
        date=row["date"],
        time=row["time"],
        type=row["type"],
        category_major=row["category_major"],
        category_minor=row["category_minor"],
        description=row["description"],
        amount=row["amount"],
        currency=row["currency"],
        payment_method=row["payment_method"],
    )


def source_from_transaction(
    transaction: Transaction | None,
) -> UploadPreviewSourceData | None:
    if transaction is None:
        return None
    return UploadPreviewSourceData(
        date=transaction.date,
        time=transaction.time,
        type=transaction.type,
        category_major=transaction.category_major,
        category_minor=transaction.category_minor,
        description=transaction.description,
        amount=transaction.amount,
        currency=transaction.currency,
        payment_method=transaction.payment_method,
    )


def field_changes(
    existing: Transaction | None,
    incoming: TransactionRow | None,
) -> tuple[UploadPreviewFieldDeltaData, ...]:
    if existing is None or incoming is None:
        return ()
    existing_source = source_from_transaction(existing)
    incoming_source = source_from_row(incoming)
    assert existing_source is not None
    assert incoming_source is not None
    return tuple(
        UploadPreviewFieldDeltaData(
            field=field_name,
            existing_value=getattr(existing_source, field_name),
            incoming_value=getattr(incoming_source, field_name),
        )
        for field_name in SOURCE_FIELD_NAMES
        if getattr(existing_source, field_name) != getattr(incoming_source, field_name)
    )


def preserved_user_fields_from_transaction(
    transaction: Transaction | None,
) -> tuple[str, ...]:
    if transaction is None:
        return ()
    preserved_fields = [
        field_name
        for field_name, value in (
            ("category_major_user", transaction.category_major_user),
            ("category_minor_user", transaction.category_minor_user),
            ("memo", transaction.memo),
        )
        if value is not None
    ]
    if transaction.merchant != transaction.description:
        preserved_fields.append("merchant_override")
    if transaction.is_deleted:
        preserved_fields.append("is_deleted")
    if transaction.merged_into_id is not None:
        preserved_fields.append("merged_into_id")
    return tuple(preserved_fields)


def preservation_summary(
    preserved_user_fields: tuple[str, ...],
    review_required: bool,
) -> str:
    if preserved_user_fields:
        return f"Preserves user-managed fields: {', '.join(preserved_user_fields)}."
    if review_required:
        return "Review required before any existing transaction can be updated."
    return "No user-managed transaction fields would be overwritten."
