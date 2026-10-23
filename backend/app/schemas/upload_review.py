"""Exact reviewed-import contract; API-key possession is not human approval proof."""

from datetime import date
from typing import Annotated, Literal, Self

from pydantic import BaseModel, ConfigDict, Field, StrictBool, model_validator

from app.schemas.upload import (
    UploadPreviewChangeCounts,
    UploadPreviewChangeType,
    UploadPreviewFieldDelta,
    UploadPreviewSourceRow,
)

HexDigest = Annotated[str, Field(pattern=r"^[0-9a-f]{64}$")]
Action = Literal["keep", "add", "update"]


class ReviewModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ReviewContext(ReviewModel):
    owner_profile: Literal["finance"]
    account_hash: HexDigest
    message_id: Annotated[str, Field(pattern=r"^[0-9a-f]+$")]
    archive_hash: HexDigest


class ReviewDecision(ReviewModel):
    entry_id: Annotated[str, Field(pattern=r"^[1-9][0-9]*$")]
    action: Action
    target_id: Annotated[int, Field(strict=True, gt=0)] | None

    @model_validator(mode="after")
    def check_target(self) -> Self:
        if (self.action == "update") != (self.target_id is not None):
            raise ValueError("Only update requires a target_id; keep/add require null")
        return self


class ReviewRevision(ReviewModel):
    plan_digest: HexDigest
    decisions: list[ReviewDecision]


class ReviewApplyRequest(ReviewRevision):
    confirmation: StrictBool
    context: ReviewContext
    snapshot_effect_ack: StrictBool
    approval_reference: Annotated[str, Field(min_length=1, max_length=2048)]

    @model_validator(mode="after")
    def check_confirmation(self) -> Self:
        if not self.confirmation or not self.snapshot_effect_ack:
            raise ValueError(
                "Explicit confirmation and snapshot acknowledgement required"
            )
        if self.approval_reference != self.approval_reference.strip():
            raise ValueError(
                "approval_reference must be exact nonempty canonical locator"
            )
        return self


class ReviewCandidate(ReviewModel):
    transaction_id: int
    source: UploadPreviewSourceRow


class ReviewEntry(ReviewModel):
    entry_id: str
    change_type: UploadPreviewChangeType
    reason: str
    existing_source: UploadPreviewSourceRow | None
    incoming_source: UploadPreviewSourceRow | None
    field_changes: list[UploadPreviewFieldDelta]
    candidates: list[ReviewCandidate]
    allowed_actions: list[Action]
    recommended_action: Action
    recommended_target_id: int | None


class ReviewApplied(ReviewModel):
    entry_id: str
    action: Literal["add", "update"]
    transaction_id: int


class ReviewResult(ReviewModel):
    upload_id: int
    applied: list[ReviewApplied]
    kept: list[str]
    snapshot_counts: dict[str, int]
    snapshot_verified: bool
    decision_digest: HexDigest
    approval_reference: str


class ReviewResponse(ReviewModel):
    operation_id: str
    status: Literal["prepared", "applied", "stale"]
    version: int
    plan_digest: HexDigest
    file_sha256: HexDigest
    snapshot_date: date
    context: ReviewContext
    entries: list[ReviewEntry]
    counts: UploadPreviewChangeCounts
    decisions: list[ReviewDecision]
    snapshot_effects: dict
    result: ReviewResult | None
