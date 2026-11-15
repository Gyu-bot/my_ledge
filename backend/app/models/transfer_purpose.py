"""Human-set transfer purpose (T061): what an 이체 leg did with the money.

Purposes (set only by a human, never inferred or suggested):

- ``investment``: the leg moves money between the transaction ledger and a
  holding reported in the ``investments`` snapshot (투자 이체).
- ``savings``: the leg moves money between the ledger and a savings deposit
  that is an asset snapshot row but not an ``investments`` row (저축 이체).
- ``internal_move``: any other move between the person's own accounts
  (그 밖의 계좌 간 이동).

A transfer with no transaction-level purpose and no matching rule is
``undecided``. New tables only, as in T056: no column is added to
``transactions`` or any other table that the import contract or rollback
fingerprints already enumerate.

- ``transfer_purpose_overrides``: per-transaction purpose (highest precedence).
- ``transfer_purpose_rules``: human-registered defaults by counterparty
  (``match_scope='merchant'``, exact ``merchant``) or by effective category
  (``match_scope='category'``; a null ``category_minor`` covers the whole
  major category).
"""

from sqlalchemy import ForeignKey, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin

TRANSFER_PURPOSES = ("investment", "savings", "internal_move")
TRANSFER_RULE_SCOPES = ("merchant", "category")


class TransferPurposeRule(TimestampMixin, Base):
    __tablename__ = "transfer_purpose_rules"
    __table_args__ = (
        Index("ix_transfer_purpose_rules_scope_merchant", "match_scope", "merchant"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    match_scope: Mapped[str] = mapped_column(String(20), nullable=False)
    merchant: Mapped[str | None] = mapped_column(String(500))
    category_major: Mapped[str | None] = mapped_column(String(50))
    category_minor: Mapped[str | None] = mapped_column(String(50))
    purpose: Mapped[str] = mapped_column(String(20), nullable=False)
    label: Mapped[str | None] = mapped_column(String(200))
    memo: Mapped[str | None] = mapped_column(Text)


class TransferPurposeOverride(TimestampMixin, Base):
    __tablename__ = "transfer_purpose_overrides"

    transaction_id: Mapped[int] = mapped_column(
        ForeignKey("transactions.id", ondelete="CASCADE"),
        primary_key=True,
    )
    purpose: Mapped[str] = mapped_column(String(20), nullable=False)
