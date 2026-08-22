from dataclasses import dataclass

from app.services.upload_preview_models import UploadPreviewChangeCounts
from app.services.upload_preview_models import UploadPreviewChangeData


@dataclass(frozen=True, slots=True)
class UploadApplySelectionError(Exception):
    code: str
    message: str
    selection_index: int

    def __str__(self) -> str:
        return self.message


@dataclass(frozen=True, slots=True)
class UploadApplyAuditSelection:
    change_type: str
    source_row_hash: str
    existing_transaction_id: int | None
    reason: str
    preserved_user_fields: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class UploadApplyAuditRecord:
    confirmation: bool
    selected_change_count: int
    applied_change_count: int
    selected_changes: tuple[UploadApplyAuditSelection, ...]
    change_type_counts: UploadPreviewChangeCounts


@dataclass(frozen=True, slots=True)
class TransactionUploadApplyResult:
    upload_id: int
    parsed_transaction_count: int
    selected_change_count: int
    applied_change_count: int
    change_type_counts: UploadPreviewChangeCounts
    applied_changes: tuple[UploadPreviewChangeData, ...]
    tx_new: int
    tx_skipped: int
    asset_snapshot_count: int
    insurance_contract_count: int
    investment_count: int
    loan_count: int
