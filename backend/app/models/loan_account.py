from sqlalchemy import String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class LoanAccount(TimestampMixin, Base):
    __tablename__ = "loan_accounts"
    __table_args__ = (
        UniqueConstraint(
            "lender",
            "product_name",
            name="uq_loan_accounts_lender_product_name",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    lender: Mapped[str] = mapped_column(String(50), nullable=False)
    product_name: Mapped[str] = mapped_column(String(200), nullable=False)
