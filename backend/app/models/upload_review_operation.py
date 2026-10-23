from datetime import date

from sqlalchemy import JSON, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class UploadReviewOperation(TimestampMixin, Base):
    __tablename__ = "upload_review_operations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    binding_digest: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    state_digest: Mapped[str] = mapped_column(String(64), nullable=False)
    file_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    snapshot_date: Mapped[date] = mapped_column(nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False)
    version: Mapped[int] = mapped_column(nullable=False)
    plan_digest: Mapped[str] = mapped_column(String(64), nullable=False)
    payload: Mapped[dict] = mapped_column(JSON, nullable=False)
    applied_request_digest: Mapped[str | None] = mapped_column(String(64))
