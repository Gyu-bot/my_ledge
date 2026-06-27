from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class LoanCandidateReview(TimestampMixin, Base):
    __tablename__ = "loan_candidate_reviews"
    __table_args__ = (
        UniqueConstraint(
            "candidate_key",
            name="uq_loan_candidate_reviews_candidate_key",
        ),
        UniqueConstraint(
            "transaction_id",
            name="uq_loan_candidate_reviews_transaction_id",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    candidate_key: Mapped[str] = mapped_column(String(120), nullable=False)
    candidate_type: Mapped[str] = mapped_column(String(50), nullable=False)
    transaction_id: Mapped[int] = mapped_column(
        ForeignKey("transactions.id"),
        nullable=False,
    )
    review_status: Mapped[str] = mapped_column(String(20), nullable=False)
    memo: Mapped[str | None] = mapped_column(Text)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
