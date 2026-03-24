from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Date, Numeric, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Loan(Base):
    __tablename__ = "loans"
    __table_args__ = (
        UniqueConstraint(
            "snapshot_date",
            "lender",
            "product_name",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    snapshot_date: Mapped[date] = mapped_column(Date, nullable=False)
    loan_type: Mapped[str | None] = mapped_column(String(30))
    lender: Mapped[str | None] = mapped_column(String(50))
    product_name: Mapped[str] = mapped_column(String(200), nullable=False)
    principal: Mapped[Decimal | None] = mapped_column(Numeric(15, 2))
    balance: Mapped[Decimal | None] = mapped_column(Numeric(15, 2))
    interest_rate: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    start_date: Mapped[date | None] = mapped_column(Date)
    maturity_date: Mapped[date | None] = mapped_column(Date)
    created_at: Mapped[datetime] = mapped_column(
        nullable=False,
        server_default=func.now(),
    )
