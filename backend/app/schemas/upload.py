from datetime import date, datetime

from pydantic import BaseModel


class UploadTransactionSummary(BaseModel):
    total: int
    new: int
    skipped: int


class UploadSnapshotSummary(BaseModel):
    asset_snapshots: int
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
