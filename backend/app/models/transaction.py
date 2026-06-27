from datetime import date as date_type, datetime, time as time_type
from enum import StrEnum, unique

from sqlalchemy import DateTime, ForeignKey, Index, String, Text, false
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


@unique
class TransactionSourceLifecycleStatus(StrEnum):
    ACTIVE = "active"
    MISSING_FROM_LATEST_EXPORT = "missing_from_latest_export"
    SOURCE_CHANGED = "source_changed"
    SUPERSEDED = "superseded"
    DUPLICATE_CANDIDATE = "duplicate_candidate"
    AMBIGUOUS = "ambiguous"


class Transaction(TimestampMixin, Base):
    __tablename__ = "transactions"
    __table_args__ = (
        Index("idx_tx_datetime", "date", "time"),
        Index("idx_transactions_source_lifecycle_status", "source_lifecycle_status"),
        Index("idx_transactions_source_row_hash", "source_row_hash"),
    )

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
    spend_necessity: Mapped[str | None] = mapped_column(String(20))
    cost_classification_source: Mapped[str | None] = mapped_column(String(20))
    recurring_payment_kind: Mapped[str | None] = mapped_column(String(30))
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
    source_lifecycle_status: Mapped[str] = mapped_column(
        String(40),
        nullable=False,
        default=TransactionSourceLifecycleStatus.ACTIVE.value,
        server_default=TransactionSourceLifecycleStatus.ACTIVE.value,
    )
    source_row_hash: Mapped[str | None] = mapped_column(String(64))
    first_seen_import_id: Mapped[int | None] = mapped_column(
        ForeignKey("upload_logs.id"),
    )
    last_seen_import_id: Mapped[int | None] = mapped_column(
        ForeignKey("upload_logs.id"),
    )
    source_first_seen_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
    )
    source_last_seen_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
    )
    superseded_by_transaction_id: Mapped[int | None] = mapped_column(
        ForeignKey("transactions.id"),
    )
