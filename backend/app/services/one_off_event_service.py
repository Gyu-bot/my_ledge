"""Manage direct membership and read monetary attribution from flow lines."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import date
from typing import NoReturn

from fastapi import HTTPException
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.one_off_event import OneOffEvent, OneOffEventMember
from app.models.transaction import Transaction
from app.schemas.one_off_event import (
    InactiveReason,
    MemberStatus,
    OneOffEventCreate,
    OneOffEventDetail,
    OneOffEventMemberResponse,
    OneOffEventPatch,
    OneOffEventPeriod,
    OneOffEventRejection,
    OneOffEventSummary,
    RejectionReason,
)
from app.services.metric_views import (
    EXPENSE,
    FLOW_LINES_VIEW,
    METRIC_CURRENCY,
    TRANSACTION_NATURE_VIEW,
)
from app.services.upload_rollback_service import lock as lock_upload_rollback


def _inactive_reason(tx: Transaction) -> InactiveReason | None:
    if tx.is_deleted:
        return "deleted"
    if tx.merged_into_id is not None:
        return "merged"
    if (
        tx.superseded_by_transaction_id is not None
        or tx.source_lifecycle_status == "superseded"
    ):
        return "superseded"
    if tx.type != EXPENSE:
        return "not_expense"
    if tx.currency.upper() != METRIC_CURRENCY:
        return "non_krw"
    return None


async def _event_or_404(db: AsyncSession, event_id: int) -> OneOffEvent:
    event = await db.get(OneOffEvent, event_id)
    if event is None:
        raise HTTPException(404, detail="one_off_event_not_found")
    return event


async def _summaries(
    db: AsyncSession, event_id: int | None = None
) -> list[OneOffEventSummary]:
    events = select(OneOffEvent).order_by(
        OneOffEvent.created_at.desc(), OneOffEvent.id.desc()
    )
    bounds = (
        select(
            OneOffEventMember.event_id,
            func.count(),
            func.min(Transaction.date),
            func.max(Transaction.date),
        )
        .join(Transaction, Transaction.id == OneOffEventMember.transaction_id)
        .group_by(OneOffEventMember.event_id)
    )
    lines = FLOW_LINES_VIEW
    amounts = (
        select(lines.c.one_off_event_id, lines.c.period, func.sum(-lines.c.amount))
        .where(lines.c.one_off_event_id.is_not(None))
        .group_by(lines.c.one_off_event_id, lines.c.period)
        .order_by(lines.c.period)
    )
    if event_id is not None:
        events = events.where(OneOffEvent.id == event_id)
        bounds = bounds.where(OneOffEventMember.event_id == event_id)
        amounts = amounts.where(lines.c.one_off_event_id == event_id)
    direct: dict[int, tuple[int, date, date]] = {
        key: (count, first, last)
        for key, count, first, last in await db.execute(bounds)
    }
    periods: dict[int, list[OneOffEventPeriod]] = {}
    for key, period, amount in await db.execute(amounts):
        periods.setdefault(key, []).append(
            OneOffEventPeriod(period=period, amount=amount)
        )
    return [
        OneOffEventSummary(
            id=event.id,
            name=event.name,
            note=event.note,
            direct_member_count=direct[event.id][0] if event.id in direct else 0,
            first_date=direct[event.id][1] if event.id in direct else None,
            last_date=direct[event.id][2] if event.id in direct else None,
            counted_total=sum(item.amount for item in periods.get(event.id, [])),
            periods=periods.get(event.id, []),
        )
        for event in await db.scalars(events)
    ]


async def list_events(db: AsyncSession) -> list[OneOffEventSummary]:
    return await _summaries(db)


async def get_event(db: AsyncSession, event_id: int) -> OneOffEventDetail:
    summaries = await _summaries(db, event_id)
    if not summaries:
        raise HTTPException(404, detail="one_off_event_not_found")
    nature = TRANSACTION_NATURE_VIEW
    lines = FLOW_LINES_VIEW
    has_own_line = (
        select(lines.c.transaction_id)
        .where(
            lines.c.transaction_id == Transaction.id,
            lines.c.line_kind != "refund_allocation",
        )
        .exists()
    )
    query = (
        select(Transaction, nature.c.commitment_kind, has_own_line)
        .join(OneOffEventMember, OneOffEventMember.transaction_id == Transaction.id)
        .outerjoin(nature, nature.c.transaction_id == Transaction.id)
        .where(OneOffEventMember.event_id == event_id)
        .order_by(
            Transaction.date.desc(), Transaction.time.desc(), Transaction.id.desc()
        )
    )
    members: list[OneOffEventMemberResponse] = []
    for tx, commitment_kind, has_line in await db.execute(query):
        reason = _inactive_reason(tx)
        status: MemberStatus
        if reason is not None:
            status = "inactive"
        elif commitment_kind is not None:
            status = "committed_now"
        elif has_line:
            status = "counted"
        else:
            status = "fully_allocated"
        members.append(
            OneOffEventMemberResponse(
                transaction_id=tx.id,
                date=tx.date,
                merchant=tx.merchant,
                description=tx.description,
                category_major=tx.category_major
                if tx.category_major_user is None
                else tx.category_major_user,
                category_minor=tx.category_minor
                if tx.category_minor_user is None
                else tx.category_minor_user,
                amount=tx.amount,
                currency=tx.currency,
                member_status=status,
                inactive_reason=reason,
            )
        )
    return OneOffEventDetail(**summaries[0].model_dump(), members=members)


def _reject_members(rejections: list[OneOffEventRejection]) -> NoReturn:
    raise HTTPException(
        409 if any(item.reason == "in_other_event" for item in rejections) else 422,
        detail=[item.model_dump() for item in rejections],
    )


async def _add_members(
    db: AsyncSession, event_id: int, transaction_ids: list[int]
) -> None:
    ids = sorted(set(transaction_ids))
    if not ids:
        return
    nature = TRANSACTION_NATURE_VIEW
    query = (
        select(Transaction, nature.c.commitment_kind, OneOffEventMember.event_id)
        .outerjoin(nature, nature.c.transaction_id == Transaction.id)
        .outerjoin(
            OneOffEventMember, OneOffEventMember.transaction_id == Transaction.id
        )
        .where(Transaction.id.in_(ids))
    )
    rows = {tx.id: (tx, kind, owner) for tx, kind, owner in await db.execute(query)}
    rejections = []
    additions = []
    for tx_id in ids:
        row = rows.get(tx_id)
        reason: RejectionReason | None = None
        if row is None:
            reason = "not_found"
        else:
            tx, kind, owner = row
            if owner == event_id:
                continue
            if owner is not None:
                reason = "in_other_event"
            elif (inactive := _inactive_reason(tx)) is not None:
                reason = (
                    inactive if inactive in ("not_expense", "non_krw") else "inactive"
                )
            elif kind is not None:
                reason = "committed"
        if reason is not None:
            rejections.append(OneOffEventRejection(transaction_id=tx_id, reason=reason))
        else:
            additions.append(tx_id)
    if rejections:
        _reject_members(rejections)

    try:
        db.add_all(
            [
                OneOffEventMember(transaction_id=tx_id, event_id=event_id)
                for tx_id in additions
            ]
        )
        await db.flush()
    except IntegrityError as exc:
        # Only the direct-membership PK race maps to a conflict.
        original = exc.orig
        sqlstate = getattr(original, "sqlstate", None)
        constraint = getattr(
            getattr(original, "__cause__", None), "constraint_name", None
        )
        sqlite_pk = (
            getattr(original, "sqlite_errorname", None)
            == "SQLITE_CONSTRAINT_PRIMARYKEY"
        )
        if not (
            sqlite_pk
            or (sqlstate == "23505" and constraint == "pk_one_off_event_members")
        ):
            raise
        await db.rollback()
        conflicts = await db.scalars(
            select(OneOffEventMember.transaction_id).where(
                OneOffEventMember.transaction_id.in_(additions)
            )
        )
        rejected = conflicts.all() or additions
        _reject_members(
            [
                OneOffEventRejection(transaction_id=tx_id, reason="in_other_event")
                for tx_id in rejected
            ]
        )


@asynccontextmanager
async def _event_write(db: AsyncSession) -> AsyncIterator[None]:
    try:
        await lock_upload_rollback(db)
        yield
        await db.commit()
    except Exception:
        await db.rollback()
        raise


async def create_event(
    db: AsyncSession, payload: OneOffEventCreate
) -> OneOffEventDetail:
    async with _event_write(db):
        event = OneOffEvent(name=payload.name, note=payload.note)
        db.add(event)
        await db.flush()
        event_id = event.id
        await _add_members(db, event_id, payload.transaction_ids)
        return await get_event(db, event_id)


async def update_event(
    db: AsyncSession, event_id: int, payload: OneOffEventPatch
) -> OneOffEventDetail:
    async with _event_write(db):
        event = await _event_or_404(db, event_id)
        for field, value in payload.model_dump(exclude_unset=True).items():
            setattr(event, field, value)
        await db.flush()
        return await get_event(db, event_id)


async def delete_event(db: AsyncSession, event_id: int) -> None:
    async with _event_write(db):
        event = await _event_or_404(db, event_id)
        # Unit-test SQLite may have FK enforcement disabled.
        await db.execute(
            delete(OneOffEventMember).where(OneOffEventMember.event_id == event_id)
        )
        await db.delete(event)


async def add_members(
    db: AsyncSession, event_id: int, transaction_ids: list[int]
) -> OneOffEventDetail:
    async with _event_write(db):
        await _event_or_404(db, event_id)
        await _add_members(db, event_id, transaction_ids)
        return await get_event(db, event_id)


async def remove_members(
    db: AsyncSession, event_id: int, transaction_ids: list[int]
) -> OneOffEventDetail:
    async with _event_write(db):
        await _event_or_404(db, event_id)
        await db.execute(
            delete(OneOffEventMember).where(
                OneOffEventMember.event_id == event_id,
                OneOffEventMember.transaction_id.in_(transaction_ids),
            )
        )
        return await get_event(db, event_id)
