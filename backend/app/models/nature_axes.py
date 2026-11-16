"""Two-axis transaction nature (T056): payment form and adjustability.

These tables replace the per-transaction ``cost_kind``/necessity/
``recurring_payment_kind`` inputs as the source of the metric views.

가져오기 검토 digest와 되돌리기 스냅샷은 확인 기록도 포함한다. 구조가 바뀌면
이전에 준비한 검토와 되돌리기 지점은 다시 사용할 수 없다.

- ``recurring_commitments``: human-registered recurring-payment bundles
  (정기 지급 묶음). A transaction belongs to a bundle when its merchant (for
  ``match_scope='merchant'``) and effective category match and its date is in
  ``[start_date, end_date]``. Cycle, amount kind, and end are bundle attributes.
- ``category_adjustability_defaults``: per-category adjustability default.
- ``transaction_nature_overrides``: per-transaction adjustability (highest
  precedence), explicit bundle membership or exclusion, and migration flags.
"""

from datetime import date as date_type, datetime

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    false,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin

ADJUSTABILITY_VALUES = ("protected", "adjustable")
COMMITMENT_SCOPES = ("merchant", "category")
COMMITMENT_CYCLES = ("monthly", "yearly", "n_times")
COMMITMENT_AMOUNT_KINDS = ("fixed", "variable")
NATURE_ORIGINS = ("migration", "user", "legacy_edit")


class RecurringCommitment(TimestampMixin, Base):
    __tablename__ = "recurring_commitments"
    __table_args__ = (
        Index(
            "ix_recurring_commitments_category_merchant",
            "category_major",
            "merchant",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    label: Mapped[str | None] = mapped_column(String(200))
    match_scope: Mapped[str] = mapped_column(String(20), nullable=False)
    merchant: Mapped[str | None] = mapped_column(String(500))
    category_major: Mapped[str] = mapped_column(String(50), nullable=False)
    category_minor: Mapped[str | None] = mapped_column(String(50))
    cycle: Mapped[str | None] = mapped_column(String(20))
    total_count: Mapped[int | None] = mapped_column(Integer)
    amount_kind: Mapped[str | None] = mapped_column(String(20))
    adjustability: Mapped[str | None] = mapped_column(String(20))
    start_date: Mapped[date_type | None] = mapped_column(Date)
    end_date: Mapped[date_type | None] = mapped_column(Date)
    origin: Mapped[str] = mapped_column(String(20), nullable=False)
    memo: Mapped[str | None] = mapped_column(Text)
    attributes_confirmed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )


class CategoryAdjustabilityDefault(TimestampMixin, Base):
    __tablename__ = "category_adjustability_defaults"
    __table_args__ = (
        UniqueConstraint(
            "category_major",
            "category_minor",
            name="uq_category_adjustability_defaults_category",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    category_major: Mapped[str] = mapped_column(String(50), nullable=False)
    category_minor: Mapped[str | None] = mapped_column(String(50))
    adjustability: Mapped[str] = mapped_column(String(20), nullable=False)


class TransactionNatureOverride(TimestampMixin, Base):
    __tablename__ = "transaction_nature_overrides"

    transaction_id: Mapped[int] = mapped_column(
        ForeignKey("transactions.id", ondelete="CASCADE"),
        primary_key=True,
    )
    adjustability: Mapped[str | None] = mapped_column(String(20))
    commitment_id: Mapped[int | None] = mapped_column(
        ForeignKey(
            "recurring_commitments.id",
            ondelete="SET NULL",
            # Explicit: the naming convention would exceed PostgreSQL's 63.
            name="fk_transaction_nature_overrides_commitment_id",
        ),
    )
    excluded_from_commitments: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=false()
    )
    installment_link_unconfirmed: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=false()
    )
    necessity_conflict: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=false()
    )
    source: Mapped[str] = mapped_column(String(20), nullable=False)
