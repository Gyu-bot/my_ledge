from datetime import UTC, datetime
from dataclasses import dataclass

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.settlement_group import SettlementMatch, SettlementMatchStatus
from app.models.transaction import Transaction, TransactionSourceLifecycleStatus
from app.services.metric_views import METRIC_CURRENCY, REFUND_ALLOCATIONS_VIEW
from app.services.settlement_group_matching import (
    SettlementGroupSnapshot,
    build_snapshots,
    candidate_purchases,
)


@dataclass(frozen=True, slots=True)
class SettlementAnalysisNetting:
    refund_total_by_original_transaction_id: dict[int, int]
    excluded_refund_transaction_ids: frozenset[int]


async def reconcile_settlement_matches(
    db_session: AsyncSession,
) -> list[SettlementGroupSnapshot]:
    transactions = await _load_transactions(db_session)
    matchable_transactions = [
        transaction
        for transaction in transactions
        if _is_auto_match_lifecycle_safe(transaction)
    ]
    manual_matches = await _load_manual_matches(db_session)
    confirmed_matches = [
        match
        for match in await _load_confirmed_matches(db_session)
        if match.status == SettlementMatchStatus.USER_CONFIRMED.value
    ]
    await _delete_computed_matches(db_session)

    purchases = [tx for tx in matchable_transactions if tx.amount < 0]
    refunds = [tx for tx in matchable_transactions if tx.amount > 0]
    purchase_amounts = {tx.id: abs(tx.amount) for tx in purchases}
    allocated_by_purchase = _manual_allocations(confirmed_matches)
    # Even an invalid historical decision still owns its pair's unique key.
    rejected_pairs = {
        (match.original_transaction_id, match.settlement_transaction_id)
        for match in manual_matches
    }
    manually_confirmed_refunds = {
        match.settlement_transaction_id for match in confirmed_matches
    }

    computed_matches: list[SettlementMatch] = []
    for refund in sorted(refunds, key=lambda tx: (tx.date, tx.time, tx.id)):
        if refund.id in manually_confirmed_refunds:
            continue
        candidates = candidate_purchases(
            refund=refund,
            purchases=purchases,
            rejected_pairs=rejected_pairs,
            allocated_by_purchase=allocated_by_purchase,
            purchase_amounts=purchase_amounts,
        )
        if len(candidates) == 1:
            purchase = candidates[0]
            computed_matches.append(
                SettlementMatch(
                    original_transaction_id=purchase.id,
                    settlement_transaction_id=refund.id,
                    status=SettlementMatchStatus.AUTO_CONFIRMED.value,
                    matched_amount=refund.amount,
                    matched_at=datetime.now(UTC),
                )
            )
            allocated_by_purchase[purchase.id] = (
                allocated_by_purchase.get(purchase.id, 0) + refund.amount
            )
            continue
        if len(candidates) > 1:
            for purchase in candidates:
                computed_matches.append(
                    SettlementMatch(
                        original_transaction_id=purchase.id,
                        settlement_transaction_id=refund.id,
                        status=SettlementMatchStatus.REVIEW_REQUIRED.value,
                        matched_amount=refund.amount,
                        matched_at=datetime.now(UTC),
                    )
                )

    if computed_matches:
        db_session.add_all(computed_matches)
    await db_session.commit()

    all_matches = confirmed_matches + computed_matches
    return build_snapshots(transactions=transactions, matches=all_matches)


async def build_confirmed_refund_netting_map(
    db_session: AsyncSession,
) -> dict[int, int]:
    totals: dict[int, int] = {}
    for match in await _load_confirmed_matches(db_session):
        totals[match.original_transaction_id] = (
            totals.get(match.original_transaction_id, 0) + match.matched_amount
        )
    return totals


async def build_confirmed_settlement_analysis_netting(
    db_session: AsyncSession,
) -> SettlementAnalysisNetting:
    refund_totals: dict[int, int] = {}
    excluded_refund_ids: set[int] = set()
    for match in await _load_confirmed_matches(db_session):
        refund_totals[match.original_transaction_id] = (
            refund_totals.get(match.original_transaction_id, 0) + match.matched_amount
        )
        excluded_refund_ids.add(match.settlement_transaction_id)

    return SettlementAnalysisNetting(
        refund_total_by_original_transaction_id=refund_totals,
        excluded_refund_transaction_ids=frozenset(excluded_refund_ids),
    )


async def _load_transactions(db_session: AsyncSession) -> list[Transaction]:
    result = await db_session.execute(
        select(Transaction)
        .where(Transaction.type == "지출")
        .where(Transaction.is_deleted.is_(False))
        .where(Transaction.merged_into_id.is_(None))
        .where(Transaction.amount != 0)
        .order_by(Transaction.date.asc(), Transaction.time.asc(), Transaction.id.asc())
    )
    return result.scalars().all()


async def _load_manual_matches(db_session: AsyncSession) -> list[SettlementMatch]:
    result = await db_session.execute(
        select(SettlementMatch).where(
            SettlementMatch.status.in_(
                [
                    SettlementMatchStatus.USER_CONFIRMED.value,
                    SettlementMatchStatus.REJECTED.value,
                ]
            )
        )
    )
    return result.scalars().all()


async def _load_confirmed_matches(db_session: AsyncSession) -> list[SettlementMatch]:
    result = await db_session.execute(
        select(SettlementMatch).join(
            REFUND_ALLOCATIONS_VIEW,
            SettlementMatch.id == REFUND_ALLOCATIONS_VIEW.c.settlement_match_id,
        )
    )
    return result.scalars().all()


async def _delete_computed_matches(db_session: AsyncSession) -> None:
    await db_session.execute(
        delete(SettlementMatch).where(
            SettlementMatch.status.in_(
                [
                    SettlementMatchStatus.AUTO_CONFIRMED.value,
                    SettlementMatchStatus.REVIEW_REQUIRED.value,
                ]
            )
        )
    )
    await db_session.flush()


def _manual_allocations(matches: list[SettlementMatch]) -> dict[int, int]:
    allocations: dict[int, int] = {}
    for match in matches:
        allocations[match.original_transaction_id] = (
            allocations.get(match.original_transaction_id, 0) + match.matched_amount
        )
    return allocations


def is_canonical_settlement_participant(transaction: Transaction) -> bool:
    return (
        not transaction.is_deleted
        and transaction.merged_into_id is None
        and transaction.superseded_by_transaction_id is None
        and transaction.source_lifecycle_status
        != TransactionSourceLifecycleStatus.SUPERSEDED
        and transaction.currency.upper() == METRIC_CURRENCY
    )


def _is_auto_match_lifecycle_safe(transaction: Transaction) -> bool:
    return is_canonical_settlement_participant(
        transaction
    ) and transaction.source_lifecycle_status in {
        TransactionSourceLifecycleStatus.ACTIVE.value,
        None,
    }
