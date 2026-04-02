from datetime import date as date_type, time as time_type

from sqlalchemy import ForeignKey, Index, String, Text, false
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class Transaction(TimestampMixin, Base):
    __tablename__ = "transactions"
    __table_args__ = (Index("idx_tx_datetime", "date", "time"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    date: Mapped[date_type] = mapped_column(nullable=False)
    time: Mapped[time_type] = mapped_column(nullable=False)
    type: Mapped[str] = mapped_column(String(10), nullable=False)
    category_major: Mapped[str] = mapped_column(String(50), nullable=False)
    category_minor: Mapped[str | None] = mapped_column(String(50))
    category_major_user: Mapped[str | None] = mapped_column(String(50))
    category_minor_user: Mapped[str | None] = mapped_column(String(50))
    description: Mapped[str] = mapped_column(String(500), nullable=False)
    merchant: Mapped[str] = mapped_column(String(500), nullable=False)
    amount: Mapped[int] = mapped_column(nullable=False)
    currency: Mapped[str] = mapped_column(
        String(5),
        nullable=False,
        default="KRW",
        server_default="KRW",
    )
    payment_method: Mapped[str | None] = mapped_column(String(100))
    cost_kind: Mapped[str | None] = mapped_column(String(20))
    fixed_cost_necessity: Mapped[str | None] = mapped_column(String(20))
    memo: Mapped[str | None] = mapped_column(Text)
    is_deleted: Mapped[bool] = mapped_column(
        nullable=False,
        default=False,
        server_default=false(),
    )
    merged_into_id: Mapped[int | None] = mapped_column(
        ForeignKey("transactions.id"),
    )
    source: Mapped[str] = mapped_column(
        String(10),
        nullable=False,
        default="import",
        server_default="import",
    )
