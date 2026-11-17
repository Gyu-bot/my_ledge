from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class InstallmentCandidateReview(TimestampMixin, Base):
    __tablename__ = "installment_candidate_reviews"

    series_key: Mapped[str] = mapped_column(String(64), primary_key=True)
    review_status: Mapped[str] = mapped_column(String(20), nullable=False)
