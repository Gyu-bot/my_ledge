from datetime import datetime
from enum import StrEnum, unique

from sqlalchemy import DateTime, ForeignKey, Index, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


@unique
class SettlementMatchStatus(StrEnum):
    AUTO_CONFIRMED = "auto_confirmed"
    REVIEW_REQUIRED = "review_required"
    USER_CONFIRMED = "user_confirmed"
    REJECTED = "rejected"


class SettlementMatch(TimestampMixin, Base):
    __tablename__ = "settlement_matches"
    __table_args__ = (
        UniqueConstraint(
            "original_transaction_id",
            "settlement_transaction_id",
            name="uq_settlement_matches_original_refund",
        ),
        Index(
            "idx_settlement_matches_settlement_transaction_id",
            "settlement_transaction_id",
        ),
        Index("idx_settlement_matches_status", "status"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    original_transaction_id: Mapped[int] = mapped_column(
        ForeignKey("transactions.id"),
        nullable=False,
    )
    settlement_transaction_id: Mapped[int] = mapped_column(
        ForeignKey("transactions.id"),
        nullable=False,
    )
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    matched_amount: Mapped[int] = mapped_column(nullable=False)
    matched_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
