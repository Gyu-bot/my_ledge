from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict

RunStatus = Literal["success_complete", "success_partial", "failed", "rejected"]


class TossSyncRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    confirm_single_account_mapping: bool = False


class TossAttempt(BaseModel):
    run_id: int
    status: RunStatus
    observed_at: datetime | None
    ingested_at: datetime
    error_code: str | None


class TossStatus(BaseModel):
    configured: bool
    last_attempt: TossAttempt | None
    mapping_connected: bool
    cooldown_seconds: int


class TossSyncResponse(BaseModel):
    run_id: int
    status: RunStatus
    holdings_count: int
    mapping_connected: bool
    error_code: str | None
    observed_at: datetime | None
