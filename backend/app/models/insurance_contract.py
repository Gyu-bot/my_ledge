from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Date, DateTime, Numeric, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class InsuranceContract(Base):
    __tablename__ = "insurance_contracts"
    __table_args__ = (
        UniqueConstraint(
            "snapshot_date",
            "insurer",
            "product_name",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    snapshot_date: Mapped[date] = mapped_column(Date, nullable=False)
    insurer: Mapped[str] = mapped_column(String(50), nullable=False)
    product_name: Mapped[str] = mapped_column(String(200), nullable=False)
    contract_status: Mapped[str | None] = mapped_column(String(30))
    total_paid: Mapped[Decimal | None] = mapped_column(Numeric(15, 2))
    contract_date: Mapped[date | None] = mapped_column(Date)
    maturity_date: Mapped[date | None] = mapped_column(Date)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
