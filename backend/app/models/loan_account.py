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
    display_name_user: Mapped[str | None] = mapped_column(String(200), nullable=True)
    loan_kind: Mapped[str | None] = mapped_column(String(40), nullable=True)
