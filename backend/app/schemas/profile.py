from datetime import date

from pydantic import BaseModel


class CreditScoreHistoryItem(BaseModel):
    snapshot_date: date
    credit_score_kcb: int | None


class ProfileResponse(BaseModel):
    snapshot_date: date | None
    gender: str | None
    age: int | None
    credit_score_kcb: int | None
    credit_score_history: list[CreditScoreHistoryItem]
