from sqlalchemy import ForeignKey, Integer, String, Text, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class InstallmentTransactionLink(TimestampMixin, Base):
    __tablename__ = "installment_transaction_links"
    __table_args__ = (
        UniqueConstraint(
            "transaction_id",
            name="uq_installment_transaction_links_transaction_id",
        ),
        UniqueConstraint(
            "installment_plan_id",
            "installment_number",
            name="uq_installment_transaction_links_plan_number",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    transaction_id: Mapped[int] = mapped_column(
        ForeignKey("transactions.id"),
        nullable=False,
    )
    installment_plan_id: Mapped[int] = mapped_column(
        ForeignKey("installment_plans.id"),
        nullable=False,
    )
    installment_number: Mapped[int] = mapped_column(Integer, nullable=False)
    source: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="manual",
        server_default=text("'manual'"),
    )
    memo: Mapped[str | None] = mapped_column(Text)
