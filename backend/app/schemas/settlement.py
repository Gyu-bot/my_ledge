from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, model_validator


SettlementManualMatchStatus = Literal["user_confirmed", "rejected"]


class SettlementMatchUpsertRequest(BaseModel):
    original_transaction_id: int = Field(ge=1)
    status: SettlementManualMatchStatus
    matched_amount: int | None = Field(default=None, gt=0)

    @model_validator(mode="after")
    def validate_status_fields(self) -> "SettlementMatchUpsertRequest":
        if self.status == "rejected" and self.matched_amount is not None:
            raise ValueError(
                "matched_amount is only allowed when status is user_confirmed"
            )
        return self


class SettlementMatchResponse(BaseModel):
    id: int
    original_transaction_id: int
    settlement_transaction_id: int
    status: SettlementManualMatchStatus
    matched_amount: int
    matched_at: datetime | None
