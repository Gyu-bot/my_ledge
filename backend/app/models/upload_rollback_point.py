from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base

JSON_DOCUMENT = JSON().with_variant(JSONB(), "postgresql")


class UploadRollbackPoint(Base):
    """Ledger state captured inside an import transaction, right before it writes."""

    __tablename__ = "upload_rollback_points"

    id: Mapped[int] = mapped_column(primary_key=True)
    upload_log_id: Mapped[int | None] = mapped_column(
        ForeignKey("upload_logs.id"), unique=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    # pending -> ready -> rolled_back | expired
    status: Mapped[str] = mapped_column(String(16), nullable=False)
    snapshot: Mapped[dict | None] = mapped_column(JSON_DOCUMENT)
    pre_fingerprint: Mapped[dict | None] = mapped_column(JSON_DOCUMENT)
    post_fingerprint: Mapped[dict | None] = mapped_column(JSON_DOCUMENT)
    rolled_back_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
