from datetime import date, datetime, time
from enum import StrEnum
from typing import Literal, Self

from pydantic import BaseModel, Field, model_validator


class UploadTransactionSummary(BaseModel):
    total: int
    new: int
    skipped: int


class UploadSnapshotSummary(BaseModel):
    asset_snapshots: int
    insurance_contracts: int = 0
    investments: int
    loans: int


class UploadResponse(BaseModel):
    status: str
    upload_id: int
    transactions: UploadTransactionSummary
    snapshots: UploadSnapshotSummary
    error_message: str | None = None


class UploadLogResponse(BaseModel):
    id: int
    uploaded_at: datetime
    filename: str | None
    snapshot_date: date | None
    tx_total: int | None
    tx_new: int | None
    tx_skipped: int | None
    status: str | None
    error_message: str | None = None


class UploadLogListResponse(BaseModel):
    items: list[UploadLogResponse]


class UploadPreviewChangeType(StrEnum):
    NEW = "new"
    UNCHANGED = "unchanged"
    SOURCE_FIELDS_CHANGED = "source_fields_changed"
    TIME_SHIFTED = "time_shifted"
    POSSIBLE_REPLACEMENT = "possible_replacement"
    MISSING_FROM_LATEST_EXPORT = "missing_from_latest_export"
    POSSIBLE_DUPLICATE = "possible_duplicate"
    AMBIGUOUS = "ambiguous"


type UploadPreviewFieldValue = date | time | int | str | None


class UploadPreviewSourceRow(BaseModel):
    date: date
    time: time
    type: str
    category_major: str
    category_minor: str | None
    description: str
    amount: int
    currency: str
    payment_method: str | None


class UploadPreviewFieldDelta(BaseModel):
    field: str
    existing_value: UploadPreviewFieldValue
    incoming_value: UploadPreviewFieldValue


class UploadPreviewChange(BaseModel):
    change_type: UploadPreviewChangeType
    review_required: bool
    auto_apply_safe: bool
    reason: str
    source_row_hash: str | None = None
    existing_transaction_id: int | None = None
    candidate_transaction_ids: list[int] = Field(default_factory=list)
    existing_source: UploadPreviewSourceRow | None = None
    incoming_source: UploadPreviewSourceRow | None = None
    field_changes: list[UploadPreviewFieldDelta] = Field(default_factory=list)
    preserved_user_fields: list[str] = Field(default_factory=list)
    preservation_summary: str


class UploadPreviewChangeCounts(BaseModel):
    new: int
    unchanged: int
    source_fields_changed: int
    time_shifted: int
    possible_replacement: int
    missing_from_latest_export: int
    possible_duplicate: int
    ambiguous: int


class UploadPreviewSummary(BaseModel):
    parsed_transaction_count: int
    safe_change_count: int
    review_required_count: int
    change_type_counts: UploadPreviewChangeCounts


class UploadPreviewResponse(BaseModel):
    filename: str
    snapshot_date: date
    summary: UploadPreviewSummary
    safe_changes: list[UploadPreviewChange]
    review_required_changes: list[UploadPreviewChange]


class UploadApplySelection(BaseModel):
    change_type: UploadPreviewChangeType
    source_row_hash: str = Field(min_length=1)
    existing_transaction_id: int | None = None


class UploadApplyRequest(BaseModel):
    confirmation: Literal[True]
    selections: list[UploadApplySelection] = Field(min_length=1)

    @model_validator(mode="after")
    def validate_unique_selections(self) -> Self:
        keys = [
            (
                selection.change_type,
                selection.source_row_hash,
                selection.existing_transaction_id,
            )
            for selection in self.selections
        ]
        if len(keys) != len(set(keys)):
            raise ValueError("selection entries must be unique")
        return self


class UploadApplySummary(BaseModel):
    parsed_transaction_count: int
    selected_change_count: int
    applied_change_count: int
    change_type_counts: UploadPreviewChangeCounts


class UploadApplyResponse(BaseModel):
    status: str
    upload_id: int
    filename: str
    snapshot_date: date
    summary: UploadApplySummary
    applied_changes: list[UploadPreviewChange]
