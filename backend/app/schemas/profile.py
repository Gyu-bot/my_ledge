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
    has_snapshot: bool = False
    missing_reason: str | None = None
    expected_source: str = "BankSalad 1.고객정보"
    source_section_found: bool | None = None
