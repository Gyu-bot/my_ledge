from datetime import date
from typing import Annotated, Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    PositiveInt,
    StringConstraints,
    model_validator,
)

EventName = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)
]
MemberStatus = Literal["counted", "fully_allocated", "committed_now", "inactive"]
InactiveReason = Literal["deleted", "merged", "superseded", "not_expense", "non_krw"]
RejectionReason = Literal[
    "not_found", "inactive", "not_expense", "non_krw", "committed", "in_other_event"
]


class OneOffEventCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: EventName
    note: str | None = None
    transaction_ids: list[PositiveInt] = Field(default_factory=list)


class OneOffEventPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: EventName | None = None
    note: str | None = None

    @model_validator(mode="after")
    def reject_null_name(self) -> "OneOffEventPatch":
        if "name" in self.model_fields_set and self.name is None:
            raise ValueError("name must be a nonempty string")
        return self


class OneOffEventMembersRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    transaction_ids: list[PositiveInt] = Field(min_length=1)


class OneOffEventRejection(BaseModel):
    transaction_id: int
    reason: RejectionReason


class OneOffEventPeriod(BaseModel):
    period: str
    amount: int


class OneOffEventSummary(BaseModel):
    id: int
    name: str
    note: str | None
    direct_member_count: int
    counted_total: int
    first_date: date | None
    last_date: date | None
    periods: list[OneOffEventPeriod]


class OneOffEventMemberResponse(BaseModel):
    transaction_id: int
    date: date
    merchant: str
    description: str
    category_major: str
    category_minor: str | None
    amount: int
    currency: str
    member_status: MemberStatus
    inactive_reason: InactiveReason | None = None


class OneOffEventDetail(OneOffEventSummary):
    members: list[OneOffEventMemberResponse]
