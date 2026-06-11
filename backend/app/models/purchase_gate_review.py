from datetime import datetime

from sqlalchemy import DateTime, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class PurchaseGateReview(TimestampMixin, Base):
    __tablename__ = "purchase_gate_reviews"
    __table_args__ = (
        UniqueConstraint(
            "candidate_key", name="uq_purchase_gate_reviews_candidate_key"
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    candidate_key: Mapped[str] = mapped_column(String(120), nullable=False)
    candidate_type: Mapped[str] = mapped_column(String(50), nullable=False)
    transaction_id: Mapped[int] = mapped_column(nullable=False)
    review_status: Mapped[str] = mapped_column(String(20), nullable=False)
    memo: Mapped[str | None] = mapped_column(Text)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cooldown_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
