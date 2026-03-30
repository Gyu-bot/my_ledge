from typing import Literal

from pydantic import BaseModel


DataResetScope = Literal["transactions_only", "transactions_and_snapshots"]


class DataResetRequest(BaseModel):
    scope: DataResetScope


class DataResetCounts(BaseModel):
    transactions: int
    asset_snapshots: int
    investments: int
    loans: int


class DataResetResponse(BaseModel):
    scope: DataResetScope
    deleted: DataResetCounts
    upload_logs_retained: bool = True
