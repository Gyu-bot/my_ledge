import calendar
from collections import defaultdict
from datetime import date

from fastapi import HTTPException, status
from sqlalchemy import Select, func, or_, select
from sqlalchemy.engine import RowMapping
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.installment_plan import InstallmentPlan
from app.models.installment_transaction_link import InstallmentTransactionLink
from app.models.transaction import Transaction
from app.schemas.installment import (
    InstallmentForecastItem,
    InstallmentForecastMonthlySummaryItem,
    InstallmentForecastResponse,
    InstallmentLinkStateFilter,
    InstallmentPlanCreateRequest,
    InstallmentPlanListResponse,
    InstallmentPlanPatchRequest,
    InstallmentPlanResponse,
    InstallmentTransactionLinkBulkUpsertRequest,
    InstallmentTransactionLinkBulkUpsertResponse,
    InstallmentTransactionLinkItem,
    InstallmentTransactionLinkUpsertRequest,
    InstallmentTransactionMappingItem,
    InstallmentTransactionMappingListResponse,
    TransactionInstallmentLinkResponse,
)
from app.services.canonical_views import build_transactions_effective_select


async def list_installment_plans(
    db_session: AsyncSession,
) -> InstallmentPlanListResponse:
    link_count = func.count(InstallmentTransactionLink.id).label(
        "linked_installment_count"
    )
    result = await db_session.execute(
        select(InstallmentPlan, link_count)
        .outerjoin(
            InstallmentTransactionLink,
            InstallmentTransactionLink.installment_plan_id == InstallmentPlan.id,
        )
        .group_by(InstallmentPlan.id)
        .order_by(
            InstallmentPlan.status.asc(),
            InstallmentPlan.first_payment_date.desc(),
            InstallmentPlan.display_name.asc(),
        )
    )
    return InstallmentPlanListResponse(
        items=[
            _serialize_plan(plan, linked_installment_count)
            for plan, linked_installment_count in result.all()
        ]
    )


async def create_installment_plan(
    db_session: AsyncSession,
    payload: InstallmentPlanCreateRequest,
) -> InstallmentPlanResponse:
    plan = InstallmentPlan(
        display_name=payload.display_name.strip(),
        merchant=payload.merchant.strip(),
        payment_method=_normalize_optional_text(payload.payment_method),
        total_installments=payload.total_installments,
        monthly_amount=payload.monthly_amount,
        first_payment_date=payload.first_payment_date,
        status=payload.status,
        memo=payload.memo,
    )
    db_session.add(plan)
    await db_session.commit()
    return await _load_plan_or_500(db_session, plan.id)


async def update_installment_plan(
    db_session: AsyncSession,
    plan_id: int,
    payload: InstallmentPlanPatchRequest,
) -> InstallmentPlanResponse:
    plan = await _get_plan_or_404(db_session, plan_id)
    update_fields = payload.model_dump(exclude_unset=True)
    if "total_installments" in update_fields:
        max_linked_number = await _load_max_linked_installment_number(db_session, plan.id)
        if update_fields["total_installments"] < max_linked_number:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="total_installments cannot be lower than existing linked installment numbers.",
            )
    for field, value in update_fields.items():
        if field in {"display_name", "merchant"} and value is not None:
            value = value.strip()
        elif field == "payment_method":
            value = _normalize_optional_text(value)
        setattr(plan, field, value)
    await db_session.commit()
    return await _load_plan_or_500(db_session, plan.id)


async def list_installment_transaction_mappings(
    db_session: AsyncSession,
    *,
    start_date: date | None,
    end_date: date | None,
    search: str | None,
    linked: InstallmentLinkStateFilter,
    installment_plan_id: int | None,
    page: int,
    per_page: int,
) -> InstallmentTransactionMappingListResponse:
    base_query = _build_mapping_query(
        start_date=start_date,
        end_date=end_date,
        search=search,
        linked=linked,
        installment_plan_id=installment_plan_id,
    )
    total = (
        await db_session.scalar(select(func.count()).select_from(base_query.subquery()))
        or 0
    )
    tx = base_query.selected_columns
    result = await db_session.execute(
        base_query
        .order_by(tx.date.desc(), tx.time.desc(), tx.id.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
    )
    return InstallmentTransactionMappingListResponse(
        total=total,
        page=page,
        per_page=per_page,
        items=[_serialize_mapping_row(row) for row in result.mappings().all()],
    )


async def get_transaction_installment_link(
    db_session: AsyncSession,
    transaction_id: int,
) -> TransactionInstallmentLinkResponse:
    await _get_transaction_or_404(db_session, transaction_id)
    return TransactionInstallmentLinkResponse(
        link=await _load_link_item(db_session, transaction_id)
    )


async def upsert_transaction_installment_link(
    db_session: AsyncSession,
    transaction_id: int,
    payload: InstallmentTransactionLinkUpsertRequest,
) -> InstallmentTransactionLinkItem:
    await _get_transaction_or_404(db_session, transaction_id)
    plan = await _get_plan_or_404(db_session, payload.installment_plan_id)
    _validate_installment_number(plan, payload.installment_number)
    await _ensure_plan_number_available(
        db_session,
        plan_id=plan.id,
        installment_number=payload.installment_number,
        transaction_id=transaction_id,
    )

    link = await db_session.scalar(
        select(InstallmentTransactionLink).where(
            InstallmentTransactionLink.transaction_id == transaction_id,
        )
    )
    if link is None:
        link = InstallmentTransactionLink(
            transaction_id=transaction_id,
            installment_plan_id=plan.id,
        )
        db_session.add(link)

    link.installment_plan_id = plan.id
    link.installment_number = payload.installment_number
    link.source = "manual"
    link.memo = payload.memo

    try:
        await db_session.commit()
    except IntegrityError as exc:
        await db_session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Installment link conflicts with an existing mapping.",
        ) from exc

    return await _load_link_item_or_500(db_session, transaction_id)


async def bulk_upsert_transaction_installment_links(
    db_session: AsyncSession,
    payload: InstallmentTransactionLinkBulkUpsertRequest,
) -> InstallmentTransactionLinkBulkUpsertResponse:
    if len(set(payload.transaction_ids)) != len(payload.transaction_ids):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="transaction_ids must be unique.",
        )

    plan = await _get_plan_or_404(db_session, payload.installment_plan_id)
    transactions = await _load_transactions_by_ids_or_404(
        db_session,
        payload.transaction_ids,
    )
    existing_result = await db_session.execute(
        select(InstallmentTransactionLink).where(
            InstallmentTransactionLink.transaction_id.in_(payload.transaction_ids),
        )
    )
    existing_links = {
        link.transaction_id: link for link in existing_result.scalars().all()
    }

    for index, transaction in enumerate(transactions):
        installment_number = payload.start_installment_number + index
        _validate_installment_number(plan, installment_number)
        await _ensure_plan_number_available(
            db_session,
            plan_id=plan.id,
            installment_number=installment_number,
            transaction_id=transaction.id,
        )
        link = existing_links.get(transaction.id)
        if link is None:
            link = InstallmentTransactionLink(
                transaction_id=transaction.id,
                installment_plan_id=plan.id,
            )
            db_session.add(link)
        link.installment_plan_id = plan.id
        link.installment_number = installment_number
        link.source = "manual"
        link.memo = payload.memo

    try:
        await db_session.commit()
    except IntegrityError as exc:
        await db_session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Installment link conflicts with an existing mapping.",
        ) from exc

    return InstallmentTransactionLinkBulkUpsertResponse(updated=len(transactions))


async def delete_transaction_installment_link(
    db_session: AsyncSession,
    transaction_id: int,
) -> bool:
    await _get_transaction_or_404(db_session, transaction_id)
    link = await db_session.scalar(
        select(InstallmentTransactionLink).where(
            InstallmentTransactionLink.transaction_id == transaction_id,
        )
    )
    if link is None:
        return False
    await db_session.delete(link)
    await db_session.commit()
    return True


async def get_installment_forecast(
    db_session: AsyncSession,
    *,
    as_of_date: date,
    months: int,
) -> InstallmentForecastResponse:
    result = await db_session.execute(
        select(InstallmentPlan).where(InstallmentPlan.status == "active")
    )
    plans = list(result.scalars().all())
    if not plans:
        return InstallmentForecastResponse(items=[], monthly_summary=[])

    link_result = await db_session.execute(
        select(InstallmentTransactionLink).where(
            InstallmentTransactionLink.installment_plan_id.in_(
                [plan.id for plan in plans]
            )
        )
    )
    links_by_plan_number = {
        (link.installment_plan_id, link.installment_number): link
        for link in link_result.scalars().all()
    }
    horizon = _add_months(as_of_date, months)
    items: list[InstallmentForecastItem] = []
    for plan in plans:
        for installment_number in range(1, plan.total_installments + 1):
            due_date = _add_months(plan.first_payment_date, installment_number - 1)
            if due_date > horizon:
                continue
            link = links_by_plan_number.get((plan.id, installment_number))
            if link is not None:
                forecast_status = "observed"
                transaction_id = link.transaction_id
            elif due_date >= as_of_date:
                forecast_status = "projected"
                transaction_id = None
            else:
                forecast_status = "missed"
                transaction_id = None
            items.append(
                InstallmentForecastItem(
                    installment_plan_id=plan.id,
                    installment_plan_display_name=plan.display_name,
                    installment_number=installment_number,
                    total_installments=plan.total_installments,
                    due_date=due_date,
                    period=due_date.strftime("%Y-%m"),
                    amount=plan.monthly_amount,
                    status=forecast_status,
                    transaction_id=transaction_id,
                )
            )
    items.sort(
        key=lambda item: (
            item.due_date,
            item.installment_plan_display_name,
            item.installment_number,
        )
    )
    return InstallmentForecastResponse(
        items=items,
        monthly_summary=_build_monthly_summary(items),
    )


def _build_mapping_query(
    *,
    start_date: date | None,
    end_date: date | None,
    search: str | None,
    linked: InstallmentLinkStateFilter,
    installment_plan_id: int | None,
) -> Select:
    canonical = build_transactions_effective_select().subquery("tx")
    query = (
        select(
            canonical,
            InstallmentTransactionLink.installment_plan_id,
            InstallmentTransactionLink.installment_number,
            InstallmentTransactionLink.source.label("installment_link_source"),
            InstallmentTransactionLink.memo.label("installment_link_memo"),
            InstallmentTransactionLink.created_at.label("installment_link_created_at"),
            InstallmentTransactionLink.updated_at.label("installment_link_updated_at"),
            InstallmentPlan.display_name.label("installment_plan_display_name"),
            InstallmentPlan.total_installments,
            InstallmentPlan.monthly_amount,
            InstallmentPlan.first_payment_date,
        )
        .select_from(canonical)
        .outerjoin(
            InstallmentTransactionLink,
            InstallmentTransactionLink.transaction_id == canonical.c.id,
        )
        .outerjoin(
            InstallmentPlan,
            InstallmentPlan.id == InstallmentTransactionLink.installment_plan_id,
        )
        .where(canonical.c.type == "지출")
        .where(
            or_(
                canonical.c.recurring_payment_kind == "installment",
                InstallmentTransactionLink.id.is_not(None),
            )
        )
    )
    if start_date is not None:
        query = query.where(canonical.c.date >= start_date)
    if end_date is not None:
        query = query.where(canonical.c.date <= end_date)
    if linked == "linked":
        query = query.where(InstallmentTransactionLink.id.is_not(None))
    elif linked == "unlinked":
        query = query.where(InstallmentTransactionLink.id.is_(None))
    if installment_plan_id is not None:
        query = query.where(
            InstallmentTransactionLink.installment_plan_id == installment_plan_id
        )
    if search:
        pattern = f"%{search}%"
        query = query.where(
            or_(
                canonical.c.description.ilike(pattern),
                canonical.c.merchant.ilike(pattern),
                canonical.c.payment_method.ilike(pattern),
                canonical.c.memo.ilike(pattern),
                InstallmentPlan.display_name.ilike(pattern),
            )
        )
    return query


async def _get_plan_or_404(
    db_session: AsyncSession,
    plan_id: int,
) -> InstallmentPlan:
    plan = await db_session.get(InstallmentPlan, plan_id)
    if plan is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Installment plan not found.",
        )
    return plan


async def _get_transaction_or_404(
    db_session: AsyncSession,
    transaction_id: int,
) -> Transaction:
    transaction = await db_session.get(Transaction, transaction_id)
    if transaction is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Transaction not found.",
        )
    return transaction


async def _load_transactions_by_ids_or_404(
    db_session: AsyncSession,
    transaction_ids: list[int],
) -> list[Transaction]:
    result = await db_session.execute(
        select(Transaction).where(Transaction.id.in_(transaction_ids))
    )
    transactions = list(result.scalars().all())
    transaction_by_id = {transaction.id: transaction for transaction in transactions}
    missing_ids = [tx_id for tx_id in transaction_ids if tx_id not in transaction_by_id]
    if missing_ids:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Transactions not found: {missing_ids}",
        )
    return sorted(
        transaction_by_id.values(),
        key=lambda transaction: (
            transaction.date,
            transaction.time,
            transaction.id,
        ),
    )


async def _ensure_plan_number_available(
    db_session: AsyncSession,
    *,
    plan_id: int,
    installment_number: int,
    transaction_id: int,
) -> None:
    existing = await db_session.scalar(
        select(InstallmentTransactionLink).where(
            InstallmentTransactionLink.installment_plan_id == plan_id,
            InstallmentTransactionLink.installment_number == installment_number,
            InstallmentTransactionLink.transaction_id != transaction_id,
        )
    )
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Installment number is already linked for this plan.",
        )


def _validate_installment_number(
    plan: InstallmentPlan,
    installment_number: int,
) -> None:
    if installment_number < 1 or installment_number > plan.total_installments:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="installment_number must be within the plan installment range.",
        )


async def _load_link_item(
    db_session: AsyncSession,
    transaction_id: int,
) -> InstallmentTransactionLinkItem | None:
    result = await db_session.execute(
        select(InstallmentTransactionLink, InstallmentPlan)
        .join(
            InstallmentPlan,
            InstallmentPlan.id == InstallmentTransactionLink.installment_plan_id,
        )
        .where(InstallmentTransactionLink.transaction_id == transaction_id)
    )
    row = result.one_or_none()
    if row is None:
        return None
    link, plan = row
    return _serialize_link(link, plan)


async def _load_link_item_or_500(
    db_session: AsyncSession,
    transaction_id: int,
) -> InstallmentTransactionLinkItem:
    item = await _load_link_item(db_session, transaction_id)
    if item is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Installment link was not persisted.",
        )
    return item


async def _load_plan_or_500(
    db_session: AsyncSession,
    plan_id: int,
) -> InstallmentPlanResponse:
    link_count = func.count(InstallmentTransactionLink.id).label(
        "linked_installment_count"
    )
    result = await db_session.execute(
        select(InstallmentPlan, link_count)
        .outerjoin(
            InstallmentTransactionLink,
            InstallmentTransactionLink.installment_plan_id == InstallmentPlan.id,
        )
        .where(InstallmentPlan.id == plan_id)
        .group_by(InstallmentPlan.id)
    )
    row = result.one_or_none()
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Installment plan was not persisted.",
        )
    plan, linked_installment_count = row
    return _serialize_plan(plan, linked_installment_count)


async def _load_max_linked_installment_number(
    db_session: AsyncSession,
    plan_id: int,
) -> int:
    value = await db_session.scalar(
        select(func.max(InstallmentTransactionLink.installment_number)).where(
            InstallmentTransactionLink.installment_plan_id == plan_id
        )
    )
    return 0 if value is None else int(value)


def _serialize_plan(
    plan: InstallmentPlan,
    linked_installment_count: int,
) -> InstallmentPlanResponse:
    return InstallmentPlanResponse(
        id=plan.id,
        display_name=plan.display_name,
        merchant=plan.merchant,
        payment_method=plan.payment_method,
        total_installments=plan.total_installments,
        monthly_amount=plan.monthly_amount,
        first_payment_date=plan.first_payment_date,
        status=plan.status,
        memo=plan.memo,
        linked_installment_count=linked_installment_count,
        created_at=plan.created_at,
        updated_at=plan.updated_at,
    )


def _serialize_link(
    link: InstallmentTransactionLink,
    plan: InstallmentPlan,
) -> InstallmentTransactionLinkItem:
    return InstallmentTransactionLinkItem(
        transaction_id=link.transaction_id,
        installment_plan_id=plan.id,
        installment_plan_display_name=plan.display_name,
        installment_number=link.installment_number,
        total_installments=plan.total_installments,
        monthly_amount=plan.monthly_amount,
        due_date=_add_months(plan.first_payment_date, link.installment_number - 1),
        source=link.source,
        memo=link.memo,
        created_at=link.created_at,
        updated_at=link.updated_at,
    )


def _serialize_mapping_row(row: RowMapping) -> InstallmentTransactionMappingItem:
    link = None
    if row["installment_plan_id"] is not None:
        link = InstallmentTransactionLinkItem(
            transaction_id=row["id"],
            installment_plan_id=row["installment_plan_id"],
            installment_plan_display_name=row["installment_plan_display_name"],
            installment_number=row["installment_number"],
            total_installments=row["total_installments"],
            monthly_amount=row["monthly_amount"],
            due_date=_add_months(
                row["first_payment_date"],
                row["installment_number"] - 1,
            ),
            source=row["installment_link_source"],
            memo=row["installment_link_memo"],
            created_at=row["installment_link_created_at"],
            updated_at=row["installment_link_updated_at"],
        )
    return InstallmentTransactionMappingItem(
        transaction_id=row["id"],
        date=row["date"],
        time=row["time"],
        type=row["type"],
        effective_category_major=row["effective_category_major"],
        effective_category_minor=row["effective_category_minor"],
        description=row["description"],
        merchant=row["merchant"],
        amount=row["amount"],
        currency=row["currency"],
        payment_method=row["payment_method"],
        memo=row["memo"],
        recurring_payment_kind=row["recurring_payment_kind"],
        link=link,
    )


def _build_monthly_summary(
    items: list[InstallmentForecastItem],
) -> list[InstallmentForecastMonthlySummaryItem]:
    grouped: dict[str, dict[str, int]] = defaultdict(
        lambda: {"observed": 0, "projected": 0, "missed": 0}
    )
    for item in items:
        grouped[item.period][item.status] += item.amount
    return [
        InstallmentForecastMonthlySummaryItem(
            period=period,
            observed_total=values["observed"],
            projected_total=values["projected"],
            missed_total=values["missed"],
        )
        for period, values in sorted(grouped.items())
    ]


def _add_months(value: date, months: int) -> date:
    month_index = value.month - 1 + months
    year = value.year + month_index // 12
    month = month_index % 12 + 1
    day = min(value.day, calendar.monthrange(year, month)[1])
    return date(year, month, day)


def _normalize_optional_text(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip()
    return normalized or None
