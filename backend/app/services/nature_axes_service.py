"""Two-axis transaction nature (T056): human-managed inputs and their read side.

- Category adjustability defaults, recurring commitments (정기 지급 묶음), and
  transaction-level adjustability are written only by explicit API calls.
- Resolution (precedence) lives in SQL: ``vw_transaction_nature``.
"""

from datetime import date

from fastapi import HTTPException, status
from sqlalchemy import delete, exists, func, inspect, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.installment_transaction_link import InstallmentTransactionLink
from app.models.loan_transaction_link import LoanTransactionLink
from app.models.nature_axes import (
    CategoryAdjustabilityDefault,
    RecurringCommitment,
    TransactionNatureOverride,
)
from app.models.transaction import Transaction
from app.schemas.nature_axes import (
    CategoryAdjustabilityDefaultListResponse,
    CategoryAdjustabilityDefaultRequest,
    CategoryAdjustabilityDefaultResponse,
    NatureCommitmentRef,
    NatureLevels,
    RecurringCommitmentCreateRequest,
    RecurringCommitmentListResponse,
    RecurringCommitmentResponse,
    RecurringCommitmentUpdateRequest,
    TransactionNatureResponse,
    _check_cycle_and_dates,
)
from app.services.metric_views import (
    EXPENSE,
    TRANSACTION_NATURE_VIEW,
    commitment_match_order,
    commitment_match_predicate,
)


_CHUNK = 500


# --------------------------------------------------------------------------
# Membership helpers (same predicate as vw_transaction_nature).
# --------------------------------------------------------------------------


async def find_rule_commitment_id(
    db_session: AsyncSession,
    *,
    merchant: str,
    category_major: str,
    category_minor: str | None,
    on_date: date,
) -> int | None:
    commitments = RecurringCommitment.__table__
    return await db_session.scalar(
        select(commitments.c.id)
        .where(
            commitment_match_predicate(
                commitments,
                merchant=merchant,
                category_major=category_major,
                category_minor=category_minor,
                on_date=on_date,
            )
        )
        .order_by(*commitment_match_order(commitments))
        .limit(1)
    )


def _effective_category(transaction: Transaction) -> tuple[str, str | None]:
    """Same as the views: COALESCE(user override, imported category)."""
    return (
        transaction.category_major_user
        if transaction.category_major_user is not None
        else transaction.category_major,
        transaction.category_minor_user
        if transaction.category_minor_user is not None
        else transaction.category_minor,
    )


async def _rule_commitment_for(
    db_session: AsyncSession, transaction: Transaction
) -> int | None:
    major, minor = _effective_category(transaction)
    return await find_rule_commitment_id(
        db_session,
        merchant=transaction.merchant,
        category_major=major,
        category_minor=minor,
        on_date=transaction.date,
    )


def _is_empty(override: TransactionNatureOverride) -> bool:
    return (
        override.adjustability is None
        and override.commitment_id is None
        and not override.excluded_from_commitments
        and not override.installment_link_unconfirmed
        and not override.necessity_conflict
    )


async def _store_or_drop(
    db_session: AsyncSession, override: TransactionNatureOverride
) -> None:
    state = inspect(override)
    if _is_empty(override):
        if state.persistent:
            await db_session.delete(override)
        elif state.pending:
            db_session.expunge(override)
        return
    if state.transient:
        db_session.add(override)


# --------------------------------------------------------------------------
# Old-column write-through.
# --------------------------------------------------------------------------


async def move_nature_override(
    db_session: AsyncSession,
    *,
    old_transaction_id: int,
    new_transaction_id: int,
) -> None:
    """Carry the new-axis classification to a re-import replacement row.

    Called where the safe-apply import already moves loan/installment links.
    When the old row was a bundle member by rule and the replacement's
    merchant/category no longer matches that bundle, the membership is pinned
    explicitly so the replacement keeps the same commitment.
    """
    old = await db_session.get(Transaction, old_transaction_id)
    new = await db_session.get(Transaction, new_transaction_id)
    if old is None or new is None:
        return
    override = await db_session.get(TransactionNatureOverride, old_transaction_id)
    pinned: int | None = None
    if (
        old.type == EXPENSE
        and not (override is not None and override.excluded_from_commitments)
        and not (override is not None and override.commitment_id is not None)
    ):
        old_commitment = await _rule_commitment_for(db_session, old)
        if old_commitment is not None and old_commitment != (
            await _rule_commitment_for(db_session, new)
        ):
            pinned = old_commitment
    if override is None and pinned is None:
        return
    target = await db_session.get(TransactionNatureOverride, new_transaction_id)
    if target is None:
        target = TransactionNatureOverride(
            transaction_id=new_transaction_id,
            excluded_from_commitments=False,
            installment_link_unconfirmed=False,
            necessity_conflict=False,
            source=override.source if override is not None else "user",
        )
        db_session.add(target)
    if override is not None:
        target.adjustability = override.adjustability
        target.commitment_id = override.commitment_id
        target.excluded_from_commitments = override.excluded_from_commitments
        target.installment_link_unconfirmed = override.installment_link_unconfirmed
        target.necessity_conflict = override.necessity_conflict
        target.source = override.source
        await db_session.delete(override)
    if pinned is not None:
        target.commitment_id = pinned
    await db_session.flush()


# --------------------------------------------------------------------------
# Category adjustability defaults.
# --------------------------------------------------------------------------


def _serialize_default(
    row: CategoryAdjustabilityDefault,
) -> CategoryAdjustabilityDefaultResponse:
    return CategoryAdjustabilityDefaultResponse.model_validate(
        row, from_attributes=True
    )


async def list_category_defaults(
    db_session: AsyncSession,
) -> CategoryAdjustabilityDefaultListResponse:
    rows = (
        await db_session.scalars(
            select(CategoryAdjustabilityDefault).order_by(
                CategoryAdjustabilityDefault.category_major,
                CategoryAdjustabilityDefault.category_minor.is_not(None),
                CategoryAdjustabilityDefault.category_minor,
            )
        )
    ).all()
    return CategoryAdjustabilityDefaultListResponse(
        items=[_serialize_default(row) for row in rows]
    )


async def set_category_default(
    db_session: AsyncSession, payload: CategoryAdjustabilityDefaultRequest
) -> CategoryAdjustabilityDefaultResponse:
    minor = (payload.category_minor or "").strip() or None
    major = payload.category_major.strip()
    row = await db_session.scalar(
        select(CategoryAdjustabilityDefault).where(
            CategoryAdjustabilityDefault.category_major == major,
            CategoryAdjustabilityDefault.category_minor.is_not_distinct_from(minor),
        )
    )
    if row is None:
        row = CategoryAdjustabilityDefault(category_major=major, category_minor=minor)
        db_session.add(row)
    row.adjustability = payload.adjustability
    await db_session.commit()
    await db_session.refresh(row)
    return _serialize_default(row)


async def delete_category_default(db_session: AsyncSession, default_id: int) -> None:
    row = await db_session.get(CategoryAdjustabilityDefault, default_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Category default not found")
    await db_session.delete(row)
    await db_session.commit()


# --------------------------------------------------------------------------
# Recurring commitments (정기 지급 묶음).
# --------------------------------------------------------------------------


async def _member_stats(
    db_session: AsyncSession, commitment_ids: list[int] | None = None
) -> dict[int, tuple[int, date | None, date | None]]:
    nature = TRANSACTION_NATURE_VIEW
    query = (
        select(
            nature.c.recurring_commitment_id,
            func.count(),
            func.min(nature.c.date),
            func.max(nature.c.date),
        )
        .where(nature.c.recurring_commitment_id.is_not(None))
        .group_by(nature.c.recurring_commitment_id)
    )
    if commitment_ids is not None:
        query = query.where(nature.c.recurring_commitment_id.in_(commitment_ids))
    stats: dict[int, tuple[int, date | None, date | None]] = {}
    for commitment_id, count, first, last in (await db_session.execute(query)).all():
        stats[int(commitment_id)] = (
            int(count),
            date.fromisoformat(first) if isinstance(first, str) else first,
            date.fromisoformat(last) if isinstance(last, str) else last,
        )
    return stats


def _serialize_commitment(
    row: RecurringCommitment,
    stats: dict[int, tuple[int, date | None, date | None]],
) -> RecurringCommitmentResponse:
    count, first, last = stats.get(row.id, (0, None, None))
    return RecurringCommitmentResponse(
        id=row.id,
        label=row.label,
        match_scope=row.match_scope,  # type: ignore[arg-type]
        merchant=row.merchant,
        category_major=row.category_major,
        category_minor=row.category_minor,
        cycle=row.cycle,  # type: ignore[arg-type]
        total_count=row.total_count,
        amount_kind=row.amount_kind,  # type: ignore[arg-type]
        adjustability=row.adjustability,  # type: ignore[arg-type]
        start_date=row.start_date,
        end_date=row.end_date,
        origin=row.origin,  # type: ignore[arg-type]
        memo=row.memo,
        member_transaction_count=count,
        first_member_date=first,
        last_member_date=last,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


async def list_commitments(db_session: AsyncSession) -> RecurringCommitmentListResponse:
    rows = (
        await db_session.scalars(
            select(RecurringCommitment).order_by(RecurringCommitment.id)
        )
    ).all()
    stats = await _member_stats(db_session)
    return RecurringCommitmentListResponse(
        items=[_serialize_commitment(row, stats) for row in rows]
    )


async def _commitment_or_404(
    db_session: AsyncSession, commitment_id: int
) -> RecurringCommitment:
    row = await db_session.get(RecurringCommitment, commitment_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Recurring commitment not found")
    return row


async def _respond(
    db_session: AsyncSession, row: RecurringCommitment
) -> RecurringCommitmentResponse:
    await db_session.commit()
    await db_session.refresh(row)
    return _serialize_commitment(row, await _member_stats(db_session, [row.id]))


async def create_commitment(
    db_session: AsyncSession, payload: RecurringCommitmentCreateRequest
) -> RecurringCommitmentResponse:
    data = payload.model_dump()
    data["merchant"] = (data["merchant"] or "").strip() or None
    data["category_minor"] = (data["category_minor"] or "").strip() or None
    row = RecurringCommitment(**data, origin="user")
    db_session.add(row)
    return await _respond(db_session, row)


async def update_commitment(
    db_session: AsyncSession,
    commitment_id: int,
    payload: RecurringCommitmentUpdateRequest,
) -> RecurringCommitmentResponse:
    row = await _commitment_or_404(db_session, commitment_id)
    changes = payload.model_dump(exclude_unset=True)
    if changes.get("category_major", "set") is None:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY, "category_major cannot be null"
        )
    if changes.get("match_scope", "set") is None:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY, "match_scope cannot be null"
        )
    for field, value in changes.items():
        setattr(row, field, value)
    if row.match_scope == "merchant" and not (row.merchant or "").strip():
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "merchant is required for match_scope=merchant",
        )
    if row.match_scope == "category":
        row.merchant = None
    try:
        _check_cycle_and_dates(row.cycle, row.total_count, row.start_date, row.end_date)
    except ValueError as exc:
        await db_session.rollback()
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc
    return await _respond(db_session, row)


async def end_commitment(
    db_session: AsyncSession, commitment_id: int, end_date: date
) -> RecurringCommitmentResponse:
    row = await _commitment_or_404(db_session, commitment_id)
    if row.start_date is not None and end_date < row.start_date:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "end_date must not be before start_date",
        )
    row.end_date = end_date
    return await _respond(db_session, row)


async def delete_commitment(db_session: AsyncSession, commitment_id: int) -> None:
    row = await _commitment_or_404(db_session, commitment_id)
    # Same as the PostgreSQL ON DELETE SET NULL, also for SQLite tests.
    await db_session.execute(
        update(TransactionNatureOverride)
        .where(TransactionNatureOverride.commitment_id == commitment_id)
        .values(commitment_id=None)
    )
    await db_session.delete(row)
    await db_session.flush()
    await db_session.execute(
        delete(TransactionNatureOverride).where(
            TransactionNatureOverride.adjustability.is_(None),
            TransactionNatureOverride.commitment_id.is_(None),
            TransactionNatureOverride.excluded_from_commitments.is_(False),
            TransactionNatureOverride.installment_link_unconfirmed.is_(False),
            TransactionNatureOverride.necessity_conflict.is_(False),
        )
    )
    await db_session.commit()


# --------------------------------------------------------------------------
# Transaction-level adjustability and explanation.
# --------------------------------------------------------------------------


async def _transaction_or_404(
    db_session: AsyncSession, transaction_id: int
) -> Transaction:
    transaction = await db_session.get(Transaction, transaction_id)
    if transaction is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Transaction not found")
    return transaction


async def set_transaction_adjustability(
    db_session: AsyncSession, transaction_id: int, adjustability: str
) -> TransactionNatureResponse:
    transaction = await _transaction_or_404(db_session, transaction_id)
    if transaction.type != EXPENSE:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "Adjustability applies only to 지출; 수입·이체 are not_applicable",
        )
    override = await db_session.get(TransactionNatureOverride, transaction_id)
    if override is None:
        override = TransactionNatureOverride(
            transaction_id=transaction_id,
            excluded_from_commitments=False,
            installment_link_unconfirmed=False,
        )
        db_session.add(override)
    override.adjustability = adjustability
    override.necessity_conflict = False  # the human decided
    override.source = "user"
    await db_session.commit()
    return await explain_transaction(db_session, transaction_id)


async def clear_transaction_adjustability(
    db_session: AsyncSession, transaction_id: int
) -> TransactionNatureResponse:
    await _transaction_or_404(db_session, transaction_id)
    override = await db_session.get(TransactionNatureOverride, transaction_id)
    if override is not None:
        override.adjustability = None
        override.source = "user"
        await _store_or_drop(db_session, override)
        await db_session.commit()
    return await explain_transaction(db_session, transaction_id)


async def explain_transaction(
    db_session: AsyncSession, transaction_id: int
) -> TransactionNatureResponse:
    transaction = await _transaction_or_404(db_session, transaction_id)
    await db_session.refresh(transaction)
    override = await db_session.get(TransactionNatureOverride, transaction_id)
    if override is not None:
        await db_session.refresh(override)
    nature = TRANSACTION_NATURE_VIEW
    row = (
        (
            await db_session.execute(
                select(nature).where(nature.c.transaction_id == transaction_id)
            )
        )
        .mappings()
        .one_or_none()
    )
    major, minor = _effective_category(transaction)
    commitment_ref: NatureCommitmentRef | None = None
    if row is not None and row["recurring_commitment_id"] is not None:
        commitment = await db_session.get(
            RecurringCommitment, int(row["recurring_commitment_id"])
        )
        if commitment is not None:
            commitment_ref = NatureCommitmentRef(
                id=commitment.id,
                match=row["commitment_match"],
                label=commitment.label,
                match_scope=commitment.match_scope,  # type: ignore[arg-type]
                merchant=commitment.merchant,
                category_major=commitment.category_major,
                category_minor=commitment.category_minor,
                cycle=commitment.cycle,  # type: ignore[arg-type]
                amount_kind=commitment.amount_kind,  # type: ignore[arg-type]
                start_date=commitment.start_date,
                end_date=commitment.end_date,
            )
    is_expense = transaction.type == EXPENSE
    linked = await db_session.scalar(
        select(
            exists().where(LoanTransactionLink.transaction_id == transaction_id)
            | exists().where(
                InstallmentTransactionLink.transaction_id == transaction_id
            )
        )
    )
    return TransactionNatureResponse(
        transaction_id=transaction.id,
        effective=row is not None,
        type=transaction.type,
        date=transaction.date,
        merchant=transaction.merchant,
        effective_category_major=major,
        effective_category_minor=minor,
        payment_form=row["payment_form"] if row is not None else None,
        commitment_kind=row["commitment_kind"] if row is not None else None,
        loan_account_id=row["loan_account_id"] if row is not None else None,
        installment_plan_id=row["installment_plan_id"] if row is not None else None,
        commitment=commitment_ref,
        adjustability=row["adjustability"] if row is not None else None,
        adjustability_source=row["adjustability_source"] if row is not None else None,
        levels=NatureLevels(
            fixed="protected" if is_expense and linked else None,
            transaction=override.adjustability if override is not None else None,  # type: ignore[arg-type]
            commitment=row["commitment_adjustability"] if row is not None else None,
            category_default=row["category_default_adjustability"]
            if row is not None
            else None,
        ),
        excluded_from_commitments=bool(
            override is not None and override.excluded_from_commitments
        ),
        installment_link_unconfirmed=bool(
            row["installment_link_unconfirmed"]
            if row is not None
            else override is not None and override.installment_link_unconfirmed
        ),
        necessity_conflict=bool(override is not None and override.necessity_conflict),
        override_source=override.source if override is not None else None,  # type: ignore[arg-type]
    )
