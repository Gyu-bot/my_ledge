from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.models.settlement_group import SettlementMatch, SettlementMatchStatus
from app.models.transaction import Transaction
from app.schemas.settlement import SettlementMatchResponse, SettlementMatchUpsertRequest
from app.services.settlement_group_service import reconcile_settlement_matches


CANONICAL_CONFIRM_DETAIL = (
    "Confirmed settlement participants must remain in canonical analytics basis."
)
SETTLEMENT_CONFLICT_DETAIL = "Settlement match conflicts with an existing mapping."


async def upsert_manual_settlement_match(
    db_session: AsyncSession,
    *,
    settlement_transaction_id: int,
    payload: SettlementMatchUpsertRequest,
) -> SettlementMatchResponse:
    original_transaction = await _get_transaction_or_404(
        db_session,
        payload.original_transaction_id,
    )
    settlement_transaction = await _get_transaction_or_404(
        db_session,
        settlement_transaction_id,
    )
    _validate_pair_shape(original_transaction, settlement_transaction)

    match = await db_session.scalar(
        select(SettlementMatch).where(
            SettlementMatch.original_transaction_id == payload.original_transaction_id,
            SettlementMatch.settlement_transaction_id == settlement_transaction_id,
        )
    )
    if match is None:
        match = SettlementMatch(
            original_transaction_id=payload.original_transaction_id,
            settlement_transaction_id=settlement_transaction_id,
            status=payload.status,
            matched_amount=0,
            matched_at=datetime.now(UTC),
        )
        db_session.add(match)

    match.status = payload.status
    match.matched_amount = await _resolve_matched_amount(
        db_session,
        match=match,
        original_transaction=original_transaction,
        settlement_transaction=settlement_transaction,
        payload=payload,
    )
    match.matched_at = datetime.now(UTC)

    try:
        await db_session.flush()
        await reconcile_settlement_matches(db_session)
    except IntegrityError as exc:
        await db_session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=SETTLEMENT_CONFLICT_DETAIL,
        ) from exc

    return _serialize_match(match)


async def delete_manual_settlement_match(
    db_session: AsyncSession,
    *,
    settlement_transaction_id: int,
    original_transaction_id: int,
) -> None:
    match = await db_session.scalar(
        select(SettlementMatch).where(
            SettlementMatch.original_transaction_id == original_transaction_id,
            SettlementMatch.settlement_transaction_id == settlement_transaction_id,
            SettlementMatch.status.in_(
                [
                    SettlementMatchStatus.USER_CONFIRMED.value,
                    SettlementMatchStatus.REJECTED.value,
                ]
            ),
        )
    )
    if match is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Settlement match not found.",
        )

    await db_session.delete(match)
    try:
        await db_session.flush()
        await reconcile_settlement_matches(db_session)
    except IntegrityError as exc:
        await db_session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=SETTLEMENT_CONFLICT_DETAIL,
        ) from exc


async def _get_transaction_or_404(
    db_session: AsyncSession,
    transaction_id: int,
) -> Transaction:
    transaction = await db_session.scalar(
        select(Transaction).where(Transaction.id == transaction_id)
    )
    if transaction is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Transaction not found.",
        )
    return transaction


def _validate_pair_shape(
    original_transaction: Transaction,
    settlement_transaction: Transaction,
) -> None:
    if original_transaction.id == settlement_transaction.id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Settlement transactions must reference two distinct rows.",
        )
    if original_transaction.type != "지출" or settlement_transaction.type != "지출":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Settlement matches require expense transactions on both sides.",
        )
    if original_transaction.amount >= 0 or settlement_transaction.amount <= 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Settlement matches require a negative original amount and positive refund amount.",
        )


async def _resolve_matched_amount(
    db_session: AsyncSession,
    *,
    match: SettlementMatch,
    original_transaction: Transaction,
    settlement_transaction: Transaction,
    payload: SettlementMatchUpsertRequest,
) -> int:
    if payload.status == SettlementMatchStatus.REJECTED.value:
        return settlement_transaction.amount

    _validate_confirm_participants(original_transaction, settlement_transaction)
    original_allocated, settlement_allocated = await _load_other_manual_allocations(
        db_session,
        match=match,
        original_transaction_id=original_transaction.id,
        settlement_transaction_id=settlement_transaction.id,
    )
    original_capacity = abs(original_transaction.amount) - original_allocated
    refund_capacity = settlement_transaction.amount - settlement_allocated
    allocatable_amount = min(original_capacity, refund_capacity)

    if allocatable_amount <= 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Settlement match has no remaining allocatable amount.",
        )
    if payload.matched_amount is None:
        if allocatable_amount != settlement_transaction.amount:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=(
                    "matched_amount is required when the refund cannot be fully "
                    "allocated to this original transaction."
                ),
            )
        return settlement_transaction.amount
    if payload.matched_amount > allocatable_amount:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="matched_amount exceeds the remaining allocatable settlement amount.",
        )
    return payload.matched_amount


def _validate_confirm_participants(
    original_transaction: Transaction,
    settlement_transaction: Transaction,
) -> None:
    if (
        original_transaction.is_deleted
        or original_transaction.merged_into_id is not None
        or settlement_transaction.is_deleted
        or settlement_transaction.merged_into_id is not None
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=CANONICAL_CONFIRM_DETAIL,
        )


async def _load_other_manual_allocations(
    db_session: AsyncSession,
    *,
    match: SettlementMatch,
    original_transaction_id: int,
    settlement_transaction_id: int,
) -> tuple[int, int]:
    original_transaction = aliased(Transaction)
    settlement_transaction = aliased(Transaction)
    canonical_confirmed_matches = (
        select(func.coalesce(func.sum(SettlementMatch.matched_amount), 0))
        .join(
            original_transaction,
            SettlementMatch.original_transaction_id == original_transaction.id,
        )
        .join(
            settlement_transaction,
            SettlementMatch.settlement_transaction_id == settlement_transaction.id,
        )
        .where(SettlementMatch.status == SettlementMatchStatus.USER_CONFIRMED.value)
        .where(original_transaction.type == "지출")
        .where(original_transaction.is_deleted.is_(False))
        .where(original_transaction.merged_into_id.is_(None))
        .where(original_transaction.amount < 0)
        .where(settlement_transaction.type == "지출")
        .where(settlement_transaction.is_deleted.is_(False))
        .where(settlement_transaction.merged_into_id.is_(None))
        .where(settlement_transaction.amount > 0)
    )
    original_allocated = await db_session.scalar(
        canonical_confirmed_matches.where(
            SettlementMatch.original_transaction_id == original_transaction_id,
            SettlementMatch.settlement_transaction_id != settlement_transaction_id,
        )
    )
    settlement_allocated = await db_session.scalar(
        canonical_confirmed_matches.where(
            SettlementMatch.settlement_transaction_id == settlement_transaction_id,
            SettlementMatch.original_transaction_id != original_transaction_id,
        )
    )
    if match.status == SettlementMatchStatus.USER_CONFIRMED.value:
        original_allocated = max(0, int(original_allocated or 0))
        settlement_allocated = max(0, int(settlement_allocated or 0))
    return int(original_allocated or 0), int(settlement_allocated or 0)


def _serialize_match(match: SettlementMatch) -> SettlementMatchResponse:
    return SettlementMatchResponse(
        id=match.id,
        original_transaction_id=match.original_transaction_id,
        settlement_transaction_id=match.settlement_transaction_id,
        status=match.status,
        matched_amount=match.matched_amount,
        matched_at=match.matched_at,
    )
