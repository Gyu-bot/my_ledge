from sqlalchemy import ForeignKey, String, Text, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class LoanTransactionLink(TimestampMixin, Base):
    __tablename__ = "loan_transaction_links"
    __table_args__ = (
        UniqueConstraint(
            "transaction_id",
            name="uq_loan_transaction_links_transaction_id",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    transaction_id: Mapped[int] = mapped_column(
        ForeignKey("transactions.id"),
        nullable=False,
    )
    loan_account_id: Mapped[int] = mapped_column(
        ForeignKey("loan_accounts.id"),
        nullable=False,
    )
    repayment_type: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="unknown",
        server_default=text("'unknown'"),
    )
    memo: Mapped[str | None] = mapped_column(Text)
