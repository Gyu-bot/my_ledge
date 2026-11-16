"""Append-only human limits. No defaults, recommendations, or transaction writes."""

from sqlalchemy import BigInteger, CheckConstraint, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class SpendingLimitRevision(TimestampMixin, Base):
    __tablename__ = "spending_limit_revisions"
    __table_args__ = (
        UniqueConstraint("target_kind", "target_value", "effective_from_period"),
        CheckConstraint(
            "target_kind IN ('category', 'adjustability')", name="target_kind"
        ),
        CheckConstraint(
            "target_kind = 'category' OR target_value IN ('protected', 'adjustable', 'undecided')",
            name="adjustability_value",
        ),
        CheckConstraint("amount IS NULL OR amount >= 0", name="nonnegative_amount"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    target_kind: Mapped[str] = mapped_column(String(20), nullable=False)
    target_value: Mapped[str] = mapped_column(String(50), nullable=False)
    effective_from_period: Mapped[str] = mapped_column(String(7), nullable=False)
    amount: Mapped[int | None] = mapped_column(BigInteger)
