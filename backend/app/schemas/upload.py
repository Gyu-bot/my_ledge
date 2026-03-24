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
