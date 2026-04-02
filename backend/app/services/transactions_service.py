from collections import defaultdict
from datetime import date

from fastapi import HTTPException, status
from sqlalchemy import Select, func, or_, select
from sqlalchemy.engine import RowMapping
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.transaction import Transaction
from app.services.canonical_views import build_transactions_effective_select
from app.schemas.transaction import (
    CategorySummaryItem,
    CategorySummaryResponse,
    CategoryTimelineItem,
    CategoryTimelineResponse,
    PaymentMethodSummaryItem,
    PaymentMethodSummaryResponse,
    TransactionBulkUpdateRequest,
    TransactionBulkUpdateResponse,
    TransactionCreateRequest,
    TransactionFilterOptionsResponse,
    TransactionGroupBy,
    TransactionListResponse,
    TransactionResponse,
    TransactionSourceFilter,
    TransactionSummaryItem,
    TransactionSummaryResponse,
    TransactionTypeFilter,
    TransactionUpdateRequest,
)


async def list_transactions(
    db_session: AsyncSession,
    *,
    start_date: date | None,
    end_date: date | None,
    tx_type: TransactionTypeFilter,
    source: TransactionSourceFilter,
    category_major: str | None,
    payment_method: str | None,
    is_edited: str,
    include_deleted: bool,
    include_merged: bool,
    search: str | None,
    page: int,
    per_page: int,
) -> TransactionListResponse:
    base_query, canonical = _build_transaction_query(
        start_date=start_date,
        end_date=end_date,
        tx_type=tx_type,
        source=source,
        category_major=category_major,
        payment_method=payment_method,
        is_edited=is_edited,
        include_deleted=include_deleted,
        include_merged=include_merged,
        search=search,
    )
    total = await db_session.scalar(select(func.count()).select_from(base_query.subquery())) or 0
    result = await db_session.execute(
        base_query
        .order_by(canonical.c.date.desc(), canonical.c.time.desc(), canonical.c.id.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
    )
    return TransactionListResponse(
        total=total,
        page=page,
        per_page=per_page,
        items=[_serialize_transaction_row(row) for row in result.mappings().all()],
    )


async def list_transaction_filter_options(
    db_session: AsyncSession,
    *,
    include_deleted: bool,
    include_merged: bool,
) -> TransactionFilterOptionsResponse:
    canonical = build_transactions_effective_select(
        include_deleted=include_deleted,
        include_merged=include_merged,
    ).subquery("vw_transactions_effective")

    category_rows = await db_session.execute(
        select(canonical.c.effective_category_major)
        .where(canonical.c.effective_category_major.is_not(None))
        .distinct()
        .order_by(canonical.c.effective_category_major.asc())
    )
    payment_method_rows = await db_session.execute(
        select(canonical.c.payment_method)
        .where(canonical.c.payment_method.is_not(None))
        .distinct()
        .order_by(canonical.c.payment_method.asc())
    )

    return TransactionFilterOptionsResponse(
        category_options=[row[0] for row in category_rows.all() if row[0]],
        payment_method_options=[row[0] for row in payment_method_rows.all() if row[0]],
    )


async def summarize_transactions(
    db_session: AsyncSession,
    *,
    start_date: date | None,
    end_date: date | None,
    group_by: TransactionGroupBy,
    tx_type: TransactionTypeFilter,
) -> TransactionSummaryResponse:
    transactions = await _load_filtered_transactions(
        db_session,
        start_date=start_date,
        end_date=end_date,
        category_major=None,
        payment_method=None,
        tx_type=tx_type,
        source="all",
        is_edited="all",
        include_deleted=False,
        include_merged=False,
        search=None,
    )

    grouped: dict[str, int] = defaultdict(int)
    for transaction in transactions:
        grouped[_period_key(transaction["date"], group_by)] += transaction["amount"]

    return TransactionSummaryResponse(
        items=[
            TransactionSummaryItem(period=period, amount=amount)
            for period, amount in sorted(grouped.items())
        ]
    )


async def summarize_by_category(
    db_session: AsyncSession,
    *,
    start_date: date | None,
    end_date: date | None,
    level: str,
    tx_type: TransactionTypeFilter,
) -> CategorySummaryResponse:
    transactions = await _load_filtered_transactions(
        db_session,
        start_date=start_date,
        end_date=end_date,
        category_major=None,
        payment_method=None,
        tx_type=tx_type,
        source="all",
        is_edited="all",
        include_deleted=False,
        include_merged=False,
        search=None,
    )
    grouped: dict[str, int] = defaultdict(int)
    for transaction in transactions:
        category = (
            transaction["effective_category_major"]
            if level == "major"
            else transaction["effective_category_minor"]
        )
        grouped[category or "미분류"] += transaction["amount"]

    items = [
        CategorySummaryItem(category=category, amount=amount)
        for category, amount in sorted(grouped.items(), key=lambda item: (item[1], item[0]))
    ]
    return CategorySummaryResponse(items=items)


async def summarize_by_payment_method(
    db_session: AsyncSession,
    *,
    start_date: date | None,
    end_date: date | None,
) -> PaymentMethodSummaryResponse:
    transactions = await _load_filtered_transactions(
        db_session,
        start_date=start_date,
        end_date=end_date,
        category_major=None,
        payment_method=None,
        tx_type="all",
        source="all",
        is_edited="all",
        include_deleted=False,
        include_merged=False,
        search=None,
    )
    grouped: dict[str | None, int] = defaultdict(int)
    for transaction in transactions:
        grouped[transaction["payment_method"]] += transaction["amount"]

    return PaymentMethodSummaryResponse(
        items=[
            PaymentMethodSummaryItem(payment_method=payment_method, amount=amount)
            for payment_method, amount in sorted(grouped.items(), key=lambda item: (item[1], item[0] or ""))
        ]
    )


async def summarize_category_timeline(
    db_session: AsyncSession,
    *,
    start_date: date | None,
    end_date: date | None,
    level: str,
    tx_type: TransactionTypeFilter,
) -> CategoryTimelineResponse:
    transactions = await _load_filtered_transactions(
        db_session,
        start_date=start_date,
        end_date=end_date,
        category_major=None,
        payment_method=None,
        tx_type=tx_type,
        source="all",
        is_edited="all",
        include_deleted=False,
        include_merged=False,
        search=None,
    )
    grouped: dict[tuple[str, str], int] = defaultdict(int)
    for transaction in transactions:
        category = (
            transaction["effective_category_major"]
            if level == "major"
            else transaction["effective_category_minor"]
        )
        grouped[(_period_key(transaction["date"], "month"), category or "미분류")] += transaction["amount"]

    return CategoryTimelineResponse(
        items=[
            CategoryTimelineItem(period=period, category=category, amount=amount)
            for (period, category), amount in sorted(grouped.items())
        ]
    )


async def create_transaction(
    db_session: AsyncSession,
    payload: TransactionCreateRequest,
) -> TransactionResponse:
    payload_data = payload.model_dump()
    payload_data["merchant"] = _normalized_merchant(
        merchant=payload_data.get("merchant"),
        description=payload_data["description"],
    )
    payload_data["cost_kind"] = _normalized_cost_kind(payload_data.get("cost_kind"))
    payload_data["fixed_cost_necessity"] = _normalized_fixed_cost_necessity(
        cost_kind=payload_data["cost_kind"],
        fixed_cost_necessity=payload_data.get("fixed_cost_necessity"),
    )
    transaction = Transaction(
        **payload_data,
        source="manual",
    )
    db_session.add(transaction)
    await db_session.commit()
    await db_session.refresh(transaction)
    return _serialize_transaction_model(transaction)


async def update_transaction(
    db_session: AsyncSession,
    transaction_id: int,
    payload: TransactionUpdateRequest,
) -> TransactionResponse:
    transaction = await _get_transaction_or_404(db_session, transaction_id)
    update_fields = payload.model_dump(exclude_unset=True)
    effective_cost_kind = _resolve_effective_cost_kind(
        incoming_cost_kind=update_fields.get("cost_kind"),
        current_cost_kind=transaction.cost_kind,
    )
    if "cost_kind" in update_fields:
        transaction.cost_kind = effective_cost_kind
    if "fixed_cost_necessity" in update_fields or "cost_kind" in update_fields:
        transaction.fixed_cost_necessity = _normalized_fixed_cost_necessity(
            cost_kind=effective_cost_kind,
            fixed_cost_necessity=update_fields.get(
                "fixed_cost_necessity",
                transaction.fixed_cost_necessity,
            ),
        )

    for field, value in update_fields.items():
        if field in {"cost_kind", "fixed_cost_necessity"}:
            continue
        if field == "merchant":
            value = _normalized_merchant(merchant=value, description=transaction.description)
        setattr(transaction, field, value)
    await db_session.commit()
    await db_session.refresh(transaction)
    return _serialize_transaction_model(transaction)


async def soft_delete_transaction(
    db_session: AsyncSession,
    transaction_id: int,
) -> None:
    transaction = await _get_transaction_or_404(db_session, transaction_id)
    transaction.is_deleted = True
    await db_session.commit()


async def restore_transaction(
    db_session: AsyncSession,
    transaction_id: int,
) -> TransactionResponse:
    transaction = await _get_transaction_or_404(db_session, transaction_id)
    transaction.is_deleted = False
    await db_session.commit()
    await db_session.refresh(transaction)
    return _serialize_transaction_model(transaction)


async def bulk_update_transactions(
    db_session: AsyncSession,
    payload: TransactionBulkUpdateRequest,
) -> TransactionBulkUpdateResponse:
    result = await db_session.execute(
        select(Transaction).where(Transaction.id.in_(payload.ids))
    )
    transactions = result.scalars().all()
    update_fields = payload.model_dump(exclude={"ids"}, exclude_unset=True)
    for transaction in transactions:
        effective_cost_kind = _resolve_effective_cost_kind(
            incoming_cost_kind=update_fields.get("cost_kind"),
            current_cost_kind=transaction.cost_kind,
        )
        if "cost_kind" in update_fields:
            transaction.cost_kind = effective_cost_kind
        if "fixed_cost_necessity" in update_fields or "cost_kind" in update_fields:
            transaction.fixed_cost_necessity = _normalized_fixed_cost_necessity(
                cost_kind=effective_cost_kind,
                fixed_cost_necessity=update_fields.get(
                    "fixed_cost_necessity",
                    transaction.fixed_cost_necessity,
                ),
            )
        for field, value in update_fields.items():
            if field in {"cost_kind", "fixed_cost_necessity"}:
                continue
            if field == "merchant":
                value = _normalized_merchant(merchant=value, description=transaction.description)
            setattr(transaction, field, value)
    await db_session.commit()
    return TransactionBulkUpdateResponse(updated=len(transactions))


async def _load_filtered_transactions(
    db_session: AsyncSession,
    *,
    start_date: date | None,
    end_date: date | None,
    category_major: str | None,
    payment_method: str | None,
    tx_type: TransactionTypeFilter,
    source: TransactionSourceFilter,
    is_edited: str,
    include_deleted: bool,
    include_merged: bool,
    search: str | None,
) -> list[RowMapping]:
    query, canonical = _build_transaction_query(
        start_date=start_date,
        end_date=end_date,
        category_major=category_major,
        payment_method=payment_method,
        tx_type=tx_type,
        source=source,
        is_edited=is_edited,
        include_deleted=include_deleted,
        include_merged=include_merged,
        search=search,
    )
    result = await db_session.execute(
        query.order_by(canonical.c.date.asc(), canonical.c.time.asc(), canonical.c.id.asc())
    )
    return result.mappings().all()


def _build_transaction_query(
    *,
    start_date: date | None,
    end_date: date | None,
    category_major: str | None,
    payment_method: str | None,
    tx_type: TransactionTypeFilter,
    source: TransactionSourceFilter,
    is_edited: str,
    include_deleted: bool,
    include_merged: bool,
    search: str | None,
) -> tuple[Select, object]:
    canonical = build_transactions_effective_select(
        include_deleted=include_deleted,
        include_merged=include_merged,
    ).subquery("vw_transactions_effective")
    query = select(canonical)
    if start_date is not None:
        query = query.where(canonical.c.date >= start_date)
    if end_date is not None:
        query = query.where(canonical.c.date <= end_date)
    if payment_method is not None:
        query = query.where(canonical.c.payment_method == payment_method)
    if category_major is not None:
        query = query.where(canonical.c.effective_category_major == category_major)
    if tx_type != "all":
        query = query.where(canonical.c.type == tx_type)
    if source != "all":
        query = query.where(canonical.c.source == source)
    if is_edited == "true":
        query = query.where(canonical.c.is_edited.is_(True))
    elif is_edited == "false":
        query = query.where(canonical.c.is_edited.is_(False))

    if search:
        pattern = f"%{search}%"
        query = query.where(
            or_(
                canonical.c.description.ilike(pattern),
                canonical.c.merchant.ilike(pattern),
                canonical.c.memo.ilike(pattern),
                canonical.c.payment_method.ilike(pattern),
            )
        )
    return query, canonical


async def _get_transaction_or_404(
    db_session: AsyncSession,
    transaction_id: int,
) -> Transaction:
    transaction = await db_session.get(Transaction, transaction_id)
    if transaction is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Transaction not found.")
    return transaction


def _serialize_transaction_model(transaction: Transaction) -> TransactionResponse:
    return TransactionResponse(
        id=transaction.id,
        date=transaction.date,
        time=transaction.time,
        type=transaction.type,
        category_major=transaction.category_major,
        category_minor=transaction.category_minor,
        category_major_user=transaction.category_major_user,
        category_minor_user=transaction.category_minor_user,
        effective_category_major=_effective_category_major(transaction),
        effective_category_minor=_effective_category_minor(transaction),
        description=transaction.description,
        merchant=transaction.merchant,
        amount=transaction.amount,
        currency=transaction.currency,
        payment_method=transaction.payment_method,
        cost_kind=transaction.cost_kind,
        fixed_cost_necessity=transaction.fixed_cost_necessity,
        memo=transaction.memo,
        is_deleted=transaction.is_deleted,
        merged_into_id=transaction.merged_into_id,
        is_edited=_is_edited(transaction),
        source=transaction.source,
        created_at=transaction.created_at,
        updated_at=transaction.updated_at,
    )


def _serialize_transaction_row(transaction: RowMapping) -> TransactionResponse:
    return TransactionResponse(
        id=transaction["id"],
        date=transaction["date"],
        time=transaction["time"],
        type=transaction["type"],
        category_major=transaction["category_major"],
        category_minor=transaction["category_minor"],
        category_major_user=transaction["category_major_user"],
        category_minor_user=transaction["category_minor_user"],
        effective_category_major=transaction["effective_category_major"],
        effective_category_minor=transaction["effective_category_minor"],
        description=transaction["description"],
        merchant=transaction["merchant"],
        amount=transaction["amount"],
        currency=transaction["currency"],
        payment_method=transaction["payment_method"],
        cost_kind=transaction["cost_kind"],
        fixed_cost_necessity=transaction["fixed_cost_necessity"],
        memo=transaction["memo"],
        is_deleted=transaction["is_deleted"],
        merged_into_id=transaction["merged_into_id"],
        is_edited=transaction["is_edited"],
        source=transaction["source"],
        created_at=transaction["created_at"],
        updated_at=transaction["updated_at"],
    )


def _effective_category_major(transaction: Transaction) -> str:
    return transaction.category_major_user or transaction.category_major


def _effective_category_minor(transaction: Transaction) -> str | None:
    return transaction.category_minor_user or transaction.category_minor


def _is_edited(transaction: Transaction) -> bool:
    return any(
        (
            transaction.category_major_user is not None,
            transaction.category_minor_user is not None,
            transaction.memo is not None,
            transaction.merchant != transaction.description,
        )
    )


def _normalized_merchant(*, merchant: str | None, description: str) -> str:
    if merchant is None:
        return description

    normalized = merchant.strip()
    return normalized or description


def _normalized_cost_kind(cost_kind: str | None) -> str:
    return "fixed" if cost_kind == "fixed" else "variable"


def _resolve_effective_cost_kind(
    *,
    incoming_cost_kind: str | None,
    current_cost_kind: str | None,
) -> str:
    if incoming_cost_kind is not None:
        return _normalized_cost_kind(incoming_cost_kind)
    return _normalized_cost_kind(current_cost_kind)


def _normalized_fixed_cost_necessity(
    *,
    cost_kind: str,
    fixed_cost_necessity: str | None,
) -> str | None:
    if cost_kind != "fixed":
        return None
    if fixed_cost_necessity in {"essential", "discretionary"}:
        return fixed_cost_necessity
    return None


def _period_key(tx_date: date, group_by: TransactionGroupBy) -> str:
    if group_by == "day":
        return tx_date.isoformat()
    if group_by == "week":
        iso_year, iso_week, _ = tx_date.isocalendar()
        return f"{iso_year}-W{iso_week:02d}"
    return tx_date.strftime("%Y-%m")
