from sqlalchemy import Boolean, ForeignKey, String, Text, UniqueConstraint, false
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class CategoryClassificationRule(TimestampMixin, Base):
    __tablename__ = "category_classification_rules"
    __table_args__ = (
        UniqueConstraint(
            "category_major",
            "category_minor",
            name="uq_category_classification_rules_category",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    category_major: Mapped[str] = mapped_column(String(50), nullable=False)
    category_minor: Mapped[str | None] = mapped_column(String(50))
    cost_kind: Mapped[str] = mapped_column(String(20), nullable=False)
    fixed_cost_necessity: Mapped[str | None] = mapped_column(String(20))


class LoanMerchantRule(TimestampMixin, Base):
    __tablename__ = "loan_merchant_rules"
    __table_args__ = (
        UniqueConstraint(
            "merchant",
            name="uq_loan_merchant_rules_merchant",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    merchant: Mapped[str] = mapped_column(String(500), nullable=False)
    loan_account_id: Mapped[int] = mapped_column(
        ForeignKey("loan_accounts.id"),
        nullable=False,
    )
    repayment_type: Mapped[str] = mapped_column(String(20), nullable=False)
    memo: Mapped[str | None] = mapped_column(Text)


class RecurringCategoryRule(TimestampMixin, Base):
    __tablename__ = "recurring_category_rules"
    __table_args__ = (
        UniqueConstraint(
            "category_major",
            "category_minor",
            name="uq_recurring_category_rules_category",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    category_major: Mapped[str] = mapped_column(String(50), nullable=False)
    category_minor: Mapped[str | None] = mapped_column(String(50))
    recurring_payment_kind: Mapped[str] = mapped_column(String(30), nullable=False)


class AutoClassificationSettings(Base):
    __tablename__ = "auto_classification_settings"

    id: Mapped[int] = mapped_column(primary_key=True, default=1)
    apply_cost_rules_on_upload: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default=false(),
    )
    apply_loan_rules_on_upload: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default=false(),
    )
    apply_recurring_rules_on_upload: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default=false(),
    )
