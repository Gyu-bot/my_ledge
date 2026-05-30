from datetime import date as date_type

from sqlalchemy import Date, Integer, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class InstallmentPlan(TimestampMixin, Base):
    __tablename__ = "installment_plans"

    id: Mapped[int] = mapped_column(primary_key=True)
    display_name: Mapped[str] = mapped_column(String(200), nullable=False)
    merchant: Mapped[str] = mapped_column(String(500), nullable=False)
    payment_method: Mapped[str | None] = mapped_column(String(100))
    total_installments: Mapped[int] = mapped_column(Integer, nullable=False)
    monthly_amount: Mapped[int] = mapped_column(Integer, nullable=False)
    first_payment_date: Mapped[date_type] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="active",
        server_default=text("'active'"),
    )
    memo: Mapped[str | None] = mapped_column(Text)
