"""Human-entered one-off expense groups and their direct membership."""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class OneOffEvent(TimestampMixin, Base):
    __tablename__ = "one_off_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(Text)
    note: Mapped[str | None] = mapped_column(Text)


class OneOffEventMember(Base):
    __tablename__ = "one_off_event_members"
    __table_args__ = (Index("ix_one_off_event_members_event_id", "event_id"),)

    transaction_id: Mapped[int] = mapped_column(
        ForeignKey("transactions.id", ondelete="CASCADE"), primary_key=True
    )
    event_id: Mapped[int] = mapped_column(
        ForeignKey("one_off_events.id", ondelete="CASCADE")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
