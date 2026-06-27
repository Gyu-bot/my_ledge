from dataclasses import dataclass
from datetime import date, time as time_type
from typing import Final, Literal

from app.parsers.transactions import TransactionRow


type UploadPreviewChangeTypeValue = Literal[
    "new",
    "unchanged",
    "source_fields_changed",
    "time_shifted",
    "possible_replacement",
    "missing_from_latest_export",
    "possible_duplicate",
    "ambiguous",
]
type PreviewValue = date | time_type | int | str | None

SOURCE_FIELD_NAMES: Final[tuple[str, ...]] = (
    "date",
    "time",
    "type",
    "category_major",
    "category_minor",
    "description",
    "amount",
    "currency",
    "payment_method",
)


@dataclass(frozen=True, slots=True)
class UploadPreviewSourceData:
    date: date
    time: time_type
    type: str
    category_major: str
    category_minor: str | None
    description: str
    amount: int
    currency: str
    payment_method: str | None


@dataclass(frozen=True, slots=True)
class UploadPreviewFieldDeltaData:
    field: str
    existing_value: PreviewValue
    incoming_value: PreviewValue


@dataclass(frozen=True, slots=True)
class UploadPreviewChangeData:
    change_type: UploadPreviewChangeTypeValue
    review_required: bool
    auto_apply_safe: bool
    reason: str
    source_row_hash: str | None
    existing_transaction_id: int | None
    candidate_transaction_ids: tuple[int, ...]
    existing_source: UploadPreviewSourceData | None
    incoming_source: UploadPreviewSourceData | None
    field_changes: tuple[UploadPreviewFieldDeltaData, ...]
    preserved_user_fields: tuple[str, ...]
    preservation_summary: str


@dataclass(frozen=True, slots=True)
class UploadPreviewChangeCounts:
    new: int
    unchanged: int
    source_fields_changed: int
    time_shifted: int
    possible_replacement: int
    missing_from_latest_export: int
    possible_duplicate: int
    ambiguous: int


@dataclass(frozen=True, slots=True)
class UploadTransactionPreviewResult:
    parsed_transaction_count: int
    safe_change_count: int
    review_required_count: int
    change_type_counts: UploadPreviewChangeCounts
    safe_changes: tuple[UploadPreviewChangeData, ...]
    review_required_changes: tuple[UploadPreviewChangeData, ...]


@dataclass(frozen=True, slots=True)
class UploadPreviewSelectionKey:
    change_type: UploadPreviewChangeTypeValue
    source_row_hash: str
    existing_transaction_id: int | None


@dataclass(frozen=True, slots=True)
class UploadPreviewPlanEntry:
    selection_key: UploadPreviewSelectionKey
    change: UploadPreviewChangeData
    incoming_row: TransactionRow | None


@dataclass(frozen=True, slots=True)
class UploadTransactionPreviewPlan:
    preview: UploadTransactionPreviewResult
    entries: tuple[UploadPreviewPlanEntry, ...]


def build_preview_plan_entry(
    change: UploadPreviewChangeData,
    incoming_row: TransactionRow | None,
) -> UploadPreviewPlanEntry:
    if change.source_row_hash is None:
        raise AssertionError("preview change missing source_row_hash")
    return UploadPreviewPlanEntry(
        selection_key=UploadPreviewSelectionKey(
            change_type=change.change_type,
            source_row_hash=change.source_row_hash,
            existing_transaction_id=change.existing_transaction_id,
        ),
        change=change,
        incoming_row=incoming_row,
    )
