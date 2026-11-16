"""Historical synthetic ledger seeds only; no runtime classification writer."""

from collections.abc import Iterable
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.transaction import Transaction
from app.models.loan_transaction_link import LoanTransactionLink
from app.models.installment_transaction_link import InstallmentTransactionLink
from app.models.nature_axes import TransactionNatureOverride, RecurringCommitment
from app.services.nature_axes_mapping import (
    EXPENSE,
    LegacyNature,
    map_legacy_classification,
)
from app.services.nature_axes_service import (
    _store_or_drop,
    _rule_commitment_for,
    _effective_category,
)

_CHUNK = 400


async def write_through_legacy_classification(
    db_session: AsyncSession, transaction_ids: Iterable[int]
) -> None:
    """Re-derive the new axes of edited transactions from their old columns.

    Deterministic, same mapping as the T056 migration. For a committed
    (recurring) result the transaction joins the bundle its merchant and
    effective category already match; otherwise the newest bundle with exactly
    that merchant/category key (explicit membership); otherwise a new bundle for
    that key is registered with ``origin='legacy_edit'``. An ad hoc result
    excludes the transaction from any matching bundle, but only when the old
    columns carry a payment-form signal (``cost_kind`` or
    ``recurring_payment_kind`` set); a necessity-only edit keeps the current
    membership. The transaction-level adjustability is set to the mapped
    necessity (null when empty, so the commitment or category default applies).
    Only 지출 rows are written; 수입/이체 stay ``not_applicable``.
    """
    ids = sorted(set(transaction_ids))
    if not ids:
        return
    await db_session.flush()
    for start in range(0, len(ids), _CHUNK):
        chunk = ids[start : start + _CHUNK]
        transactions = (
            await db_session.scalars(
                select(Transaction)
                .where(Transaction.id.in_(chunk))
                .order_by(Transaction.date, Transaction.id)
            )
        ).all()
        loan_linked = set(
            (
                await db_session.scalars(
                    select(LoanTransactionLink.transaction_id).where(
                        LoanTransactionLink.transaction_id.in_(chunk)
                    )
                )
            ).all()
        )
        installment_linked = set(
            (
                await db_session.scalars(
                    select(InstallmentTransactionLink.transaction_id).where(
                        InstallmentTransactionLink.transaction_id.in_(chunk)
                    )
                )
            ).all()
        )
        overrides = {
            row.transaction_id: row
            for row in (
                await db_session.scalars(
                    select(TransactionNatureOverride).where(
                        TransactionNatureOverride.transaction_id.in_(chunk)
                    )
                )
            ).all()
        }
        for transaction in transactions:
            if transaction.type != EXPENSE:
                continue
            nature = map_legacy_classification(
                loan_linked=transaction.id in loan_linked,
                installment_linked=transaction.id in installment_linked,
                cost_kind=transaction.cost_kind,
                fixed_cost_necessity=transaction.fixed_cost_necessity,
                spend_necessity=transaction.spend_necessity,
                recurring_payment_kind=transaction.recurring_payment_kind,
            )
            override = overrides.get(transaction.id) or TransactionNatureOverride(
                transaction_id=transaction.id,
                excluded_from_commitments=False,
                installment_link_unconfirmed=False,
                necessity_conflict=False,
                source="legacy_edit",
            )
            await _apply_legacy_nature(db_session, transaction, nature, override)
            await _store_or_drop(db_session, override)
        await db_session.flush()


async def _apply_legacy_nature(
    db_session: AsyncSession,
    transaction: Transaction,
    nature: LegacyNature,
    override: TransactionNatureOverride,
) -> None:
    override.source = "legacy_edit"
    override.adjustability = nature.adjustability
    override.installment_link_unconfirmed = nature.installment_link_unconfirmed
    override.necessity_conflict = nature.necessity_conflict
    if nature.commitment_kind == "recurring":
        override.excluded_from_commitments = False
        if override.commitment_id is not None and (
            await db_session.get(RecurringCommitment, override.commitment_id)
        ):
            return
        override.commitment_id = None
        if await _rule_commitment_for(db_session, transaction) is not None:
            return
        major, minor = _effective_category(transaction)
        same_key = await db_session.scalar(
            select(RecurringCommitment.id)
            .where(
                RecurringCommitment.match_scope == "merchant",
                RecurringCommitment.merchant == transaction.merchant,
                RecurringCommitment.category_major == major,
                RecurringCommitment.category_minor.is_not_distinct_from(minor),
            )
            .order_by(RecurringCommitment.id.desc())
            .limit(1)
        )
        if same_key is not None:
            override.commitment_id = same_key
            return
        db_session.add(
            RecurringCommitment(
                match_scope="merchant",
                merchant=transaction.merchant,
                category_major=major,
                category_minor=minor,
                cycle="monthly"
                if transaction.recurring_payment_kind == "monthly_recurring"
                else None,
                amount_kind=transaction.cost_kind
                if transaction.cost_kind in ("fixed", "variable")
                else None,
                adjustability=None,
                start_date=transaction.date,
                origin="legacy_edit",
            )
        )
        await db_session.flush()
        return
    if nature.commitment_kind is None:
        if not _has_payment_form_signal(transaction):
            # Only a necessity was given: membership is not an old-column fact,
            # so the bundle a rule or an earlier decision put it in is kept.
            return
        override.commitment_id = None
        override.excluded_from_commitments = (
            await _rule_commitment_for(db_session, transaction) is not None
        )
        return
    override.commitment_id = None
    override.excluded_from_commitments = False


def _has_payment_form_signal(transaction: Transaction) -> bool:
    return transaction.cost_kind in ("fixed", "variable") or (
        transaction.recurring_payment_kind
        in ("monthly_recurring", "installment", "not_recurring")
    )
