from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Date, DateTime, Numeric, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Investment(Base):
    __tablename__ = "investments"
    __table_args__ = (
        UniqueConstraint(
            "snapshot_date",
            "broker",
            "product_name",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    snapshot_date: Mapped[date] = mapped_column(Date, nullable=False)
    product_type: Mapped[str | None] = mapped_column(String(20))
    broker: Mapped[str] = mapped_column(String(50), nullable=False)
    product_name: Mapped[str] = mapped_column(String(200), nullable=False)
    cost_basis: Mapped[Decimal | None] = mapped_column(Numeric(15, 2))
    market_value: Mapped[Decimal | None] = mapped_column(Numeric(15, 2))
    return_rate: Mapped[Decimal | None] = mapped_column(Numeric(8, 4))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
