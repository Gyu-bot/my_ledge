from collections import defaultdict
from dataclasses import dataclass
from datetime import date
import hashlib
import json
import math

from fastapi import HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.auto_classification import (
    AutoClassificationSettings,
    CategoryClassificationRule,
    LoanMerchantRule,
    MerchantAliasRule,
    RecurringCategoryRule,
)
from app.models.loan_account import LoanAccount
from app.models.loan_transaction_link import LoanTransactionLink
from app.models.transaction import Transaction
from app.schemas.settings import RecurringDryRunSettings
from app.services.canonical_views import build_transactions_effective_select
from app.services.recurring_configuration_lock import lock_recurring_configuration
from app.services.settings_service import (
    get_analytics_settings,
    patch_analytics_settings,
)
from app.schemas.auto_classification import (
    AutoClassificationSettingsPatchRequest,
    CategoryClassificationRuleListResponse,
    CategoryClassificationRuleRequest,
    CategoryClassificationRuleResponse,
    LoanMerchantRuleListResponse,
    LoanMerchantRuleRequest,
    LoanMerchantRuleResponse,
    MerchantAliasRuleListResponse,
    MerchantAliasRuleRequest,
    MerchantAliasRuleResponse,
    RecurringCategoryRuleListResponse,
    RecurringCategoryRuleRequest,
    RecurringCategoryRuleResponse,
    RecurringDryRunApplyRequest,
    RecurringDryRunItem,
    RecurringDryRunMatchedTransaction,
    RecurringDryRunResponse,
)


@dataclass(slots=True)
class ApplyResult:
    updated: int


async def get_auto_classification_settings(
    db_session: AsyncSession,
) -> AutoClassificationSettings:
    stored = await db_session.get(AutoClassificationSettings, 1, populate_existing=True)
    analytics = await get_analytics_settings(db_session)
    return AutoClassificationSettings(
        id=1,
        apply_cost_rules_on_upload=stored.apply_cost_rules_on_upload
        if stored
        else False,
        apply_loan_rules_on_upload=stored.apply_loan_rules_on_upload
        if stored
        else False,
        apply_recurring_rules_on_upload=analytics.effective.recurring_dry_run.upload_auto_apply,
    )


async def patch_auto_classification_settings(
    db_session: AsyncSession,
    payload: AutoClassificationSettingsPatchRequest,
) -> AutoClassificationSettings:
    if payload.apply_recurring_rules_on_upload is not None:
        await lock_recurring_configuration(db_session)
    settings = await db_session.get(
        AutoClassificationSettings, 1, populate_existing=True
    )
    if settings is None:
        settings = AutoClassificationSettings(id=1)
        db_session.add(settings)

    update_fields = payload.model_dump(exclude_unset=True)
    for field, value in update_fields.items():
        if value is not None:
            setattr(settings, field, value)

    if update_fields.get("apply_recurring_rules_on_upload") is not None:
        await patch_analytics_settings(
            db_session,
            spending_anomalies={},
            recurring_dry_run={
                "upload_auto_apply": update_fields["apply_recurring_rules_on_upload"]
            },
        )
    else:
        await db_session.commit()
    return await get_auto_classification_settings(db_session)


async def list_category_classification_rules(
    db_session: AsyncSession,
) -> CategoryClassificationRuleListResponse:
    result = await db_session.execute(
        select(CategoryClassificationRule).order_by(
            CategoryClassificationRule.category_major,
            CategoryClassificationRule.category_minor,
        )
    )
    valid_categories = await _valid_category_keys(db_session)
    return CategoryClassificationRuleListResponse(
        items=[
            _serialize_category_rule(
                rule, category_valid=_category_is_valid(rule, valid_categories)
            )
            for rule in result.scalars().all()
        ]
    )


async def upsert_category_classification_rule(
    db_session: AsyncSession,
    payload: CategoryClassificationRuleRequest,
) -> CategoryClassificationRuleResponse:
    category_major = payload.category_major.strip()
    category_minor = _normalize_optional_text(payload.category_minor)
    await _validate_category(db_session, category_major, category_minor)
    rule = await _load_category_rule(
        db_session,
        category_major=category_major,
        category_minor=category_minor,
    )
    if rule is None:
        rule = CategoryClassificationRule(
            category_major=category_major,
            category_minor=category_minor,
        )
        db_session.add(rule)

    rule.cost_kind = payload.cost_kind
    rule.fixed_cost_necessity, rule.spend_necessity = _normalized_necessity_pair(
        cost_kind=payload.cost_kind,
        fixed_cost_necessity=payload.fixed_cost_necessity,
        spend_necessity=payload.spend_necessity,
    )
    await db_session.commit()
    await db_session.refresh(rule)
    return _serialize_category_rule(rule)


async def delete_category_classification_rule(
    db_session: AsyncSession,
    rule_id: int,
) -> bool:
    rule = await db_session.get(CategoryClassificationRule, rule_id)
    if rule is None:
        return False
    await db_session.delete(rule)
    await db_session.commit()
    return True


async def apply_category_classification_rules(
    db_session: AsyncSession,
) -> ApplyResult:
    rules = await _load_category_rules(db_session)
    if not rules:
        return ApplyResult(updated=0)

    result = await db_session.execute(
        select(Transaction)
        .where(Transaction.type == "지출")
        .where(Transaction.is_deleted.is_(False))
        .where(Transaction.merged_into_id.is_(None))
        .where(
            or_(
                Transaction.cost_classification_source.is_(None),
                Transaction.cost_classification_source != "manual",
            )
        )
    )
    updated = 0
    for transaction in result.scalars().all():
        rule = _match_category_rule(transaction, rules)
        if rule is None:
            continue
        if (
            transaction.cost_kind == rule.cost_kind
            and transaction.fixed_cost_necessity == rule.fixed_cost_necessity
            and transaction.spend_necessity == rule.spend_necessity
            and transaction.cost_classification_source == "auto"
        ):
            continue
        transaction.cost_kind = rule.cost_kind
        transaction.fixed_cost_necessity = rule.fixed_cost_necessity
        transaction.spend_necessity = rule.spend_necessity
        transaction.cost_classification_source = "auto"
        updated += 1

    await db_session.commit()
    return ApplyResult(updated=updated)


async def list_merchant_alias_rules(
    db_session: AsyncSession,
) -> MerchantAliasRuleListResponse:
    result = await db_session.execute(
        select(MerchantAliasRule).order_by(MerchantAliasRule.alias_pattern)
    )
    return MerchantAliasRuleListResponse(
        items=[_serialize_merchant_alias_rule(rule) for rule in result.scalars().all()]
    )


async def upsert_merchant_alias_rule(
    db_session: AsyncSession,
    payload: MerchantAliasRuleRequest,
) -> MerchantAliasRuleResponse:
    alias_pattern = payload.alias_pattern.strip()
    normalized_merchant = payload.normalized_merchant.strip()
    rule = await db_session.scalar(
        select(MerchantAliasRule).where(
            MerchantAliasRule.alias_pattern == alias_pattern
        )
    )
    if rule is None:
        rule = MerchantAliasRule(alias_pattern=alias_pattern)
        db_session.add(rule)
    rule.normalized_merchant = normalized_merchant
    await db_session.commit()
    await db_session.refresh(rule)
    return _serialize_merchant_alias_rule(rule)


async def delete_merchant_alias_rule(
    db_session: AsyncSession,
    rule_id: int,
) -> bool:
    rule = await db_session.get(MerchantAliasRule, rule_id)
    if rule is None:
        return False
    await db_session.delete(rule)
    await db_session.commit()
    return True


async def apply_merchant_alias_rules(
    db_session: AsyncSession,
) -> ApplyResult:
    result = await db_session.execute(select(MerchantAliasRule))
    rules = result.scalars().all()
    if not rules:
        return ApplyResult(updated=0)

    rows = await db_session.execute(
        select(Transaction)
        .where(Transaction.is_deleted.is_(False))
        .where(Transaction.merged_into_id.is_(None))
        .where(Transaction.merchant == Transaction.description)
    )
    updated = 0
    for transaction in rows.scalars().all():
        normalized = _normalized_merchant_for_rules(transaction.description, rules)
        if normalized is None or normalized == transaction.merchant:
            continue
        transaction.merchant = normalized
        updated += 1

    await db_session.commit()
    return ApplyResult(updated=updated)


async def list_loan_merchant_rules(
    db_session: AsyncSession,
) -> LoanMerchantRuleListResponse:
    result = await db_session.execute(
        select(LoanMerchantRule, LoanAccount)
        .join(LoanAccount, LoanMerchantRule.loan_account_id == LoanAccount.id)
        .order_by(LoanMerchantRule.match_field, LoanMerchantRule.merchant)
    )
    return LoanMerchantRuleListResponse(
        items=[
            _serialize_loan_merchant_rule(rule, account)
            for rule, account in result.all()
        ]
    )


async def upsert_loan_merchant_rule(
    db_session: AsyncSession,
    payload: LoanMerchantRuleRequest,
) -> LoanMerchantRuleResponse:
    account = await db_session.get(LoanAccount, payload.loan_account_id)
    if account is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Loan account not found.",
        )

    merchant = payload.merchant.strip()
    rule = await db_session.scalar(
        select(LoanMerchantRule).where(
            LoanMerchantRule.match_field == payload.match_field,
            LoanMerchantRule.merchant == merchant,
        )
    )
    if rule is None:
        rule = LoanMerchantRule(
            merchant=merchant,
            match_field=payload.match_field,
            loan_account_id=account.id,
        )
        db_session.add(rule)

    rule.match_field = payload.match_field
    rule.loan_account_id = account.id
    rule.repayment_type = payload.repayment_type
    rule.memo = payload.memo
    await db_session.commit()
    await db_session.refresh(rule)
    return _serialize_loan_merchant_rule(rule, account)


async def delete_loan_merchant_rule(
    db_session: AsyncSession,
    rule_id: int,
) -> bool:
    rule = await db_session.get(LoanMerchantRule, rule_id)
    if rule is None:
        return False
    await db_session.delete(rule)
    await db_session.commit()
    return True


async def apply_loan_merchant_rules(
    db_session: AsyncSession,
) -> ApplyResult:
    result = await db_session.execute(
        select(LoanMerchantRule, LoanAccount).join(
            LoanAccount, LoanMerchantRule.loan_account_id == LoanAccount.id
        )
    )
    rules_by_merchant: dict[str, LoanMerchantRule] = {}
    rules_by_description: dict[str, LoanMerchantRule] = {}
    for rule, _account in result.all():
        if rule.match_field == "description":
            rules_by_description[rule.merchant] = rule
        else:
            rules_by_merchant[rule.merchant] = rule

    if not rules_by_merchant and not rules_by_description:
        return ApplyResult(updated=0)

    match_clauses = []
    if rules_by_merchant:
        match_clauses.append(Transaction.merchant.in_(list(rules_by_merchant)))
    if rules_by_description:
        match_clauses.append(Transaction.description.in_(list(rules_by_description)))

    rows = await db_session.execute(
        select(Transaction, LoanTransactionLink)
        .outerjoin(
            LoanTransactionLink,
            LoanTransactionLink.transaction_id == Transaction.id,
        )
        .where(Transaction.type == "지출")
        .where(Transaction.is_deleted.is_(False))
        .where(Transaction.merged_into_id.is_(None))
        .where(or_(*match_clauses))
    )

    updated = 0
    affected_account_ids: set[int] = set()
    for transaction, link in rows.all():
        if link is not None and link.source == "manual":
            continue
        rule = rules_by_merchant.get(transaction.merchant)
        if rule is None:
            rule = rules_by_description.get(transaction.description)
        if rule is None:
            continue
        if link is None:
            link = LoanTransactionLink(
                transaction_id=transaction.id,
                loan_account_id=rule.loan_account_id,
            )
            db_session.add(link)
        elif (
            link.loan_account_id == rule.loan_account_id
            and link.repayment_type == rule.repayment_type
            and link.memo == rule.memo
            and link.source == "auto"
        ):
            continue
        affected_account_ids.update({link.loan_account_id, rule.loan_account_id})
        link.loan_account_id = rule.loan_account_id
        link.repayment_type = rule.repayment_type
        link.memo = rule.memo
        link.source = "auto"
        updated += 1

    if affected_account_ids:
        from app.services.loan_mapping_service import (
            apply_loan_repayment_estimates_for_accounts,
        )

        await apply_loan_repayment_estimates_for_accounts(
            db_session, account_ids=affected_account_ids
        )
    await db_session.commit()
    return ApplyResult(updated=updated)


async def list_recurring_category_rules(
    db_session: AsyncSession,
) -> RecurringCategoryRuleListResponse:
    result = await db_session.execute(
        select(RecurringCategoryRule).order_by(
            RecurringCategoryRule.category_major,
            RecurringCategoryRule.category_minor,
        )
    )
    valid_categories = await _valid_category_keys(db_session)
    return RecurringCategoryRuleListResponse(
        items=[
            _serialize_recurring_category_rule(
                rule, category_valid=_category_is_valid(rule, valid_categories)
            )
            for rule in result.scalars().all()
        ]
    )


async def upsert_recurring_category_rule(
    db_session: AsyncSession,
    payload: RecurringCategoryRuleRequest,
) -> RecurringCategoryRuleResponse:
    await lock_recurring_configuration(db_session)
    category_major = payload.category_major.strip()
    category_minor = _normalize_optional_text(payload.category_minor)
    await _validate_category(db_session, category_major, category_minor)
    rule = await _load_recurring_category_rule(
        db_session,
        category_major=category_major,
        category_minor=category_minor,
    )
    if rule is None:
        rule = RecurringCategoryRule(
            category_major=category_major,
            category_minor=category_minor,
        )
        db_session.add(rule)

    rule.recurring_payment_kind = payload.recurring_payment_kind
    await db_session.commit()
    await db_session.refresh(rule)
    return _serialize_recurring_category_rule(rule)


async def delete_recurring_category_rule(
    db_session: AsyncSession,
    rule_id: int,
) -> bool:
    await lock_recurring_configuration(db_session)
    rule = await db_session.get(RecurringCategoryRule, rule_id, populate_existing=True)
    if rule is None:
        return False
    await db_session.delete(rule)
    await db_session.commit()
    return True


async def apply_recurring_category_rules(
    db_session: AsyncSession,
    *,
    require_upload_enabled: bool = False,
) -> ApplyResult:
    candidates, settings = await _recurring_proposals(
        db_session, lock=True, require_upload_enabled=require_upload_enabled
    )
    if require_upload_enabled and not settings.upload_auto_apply:
        await db_session.commit()
        return ApplyResult(updated=0)
    updated = 0
    for item, rows in candidates:
        for transaction in rows:
            transaction.recurring_payment_kind = item.proposed_kind
            updated += 1
    await db_session.commit()
    return ApplyResult(updated=updated)


async def dry_run_recurring_category_rules(
    db_session: AsyncSession,
) -> RecurringDryRunResponse:
    candidates, _settings = await _recurring_proposals(db_session)
    return RecurringDryRunResponse(items=[item for item, _rows in candidates])


async def apply_recurring_dry_run(
    db_session: AsyncSession,
    payload: RecurringDryRunApplyRequest,
) -> ApplyResult:
    candidates, settings = await _recurring_proposals(db_session, lock=True)
    matching = next(
        (
            (item, rows)
            for item, rows in candidates
            if item.merchant == payload.merchant
            and item.proposed_kind == payload.proposed_kind
            and item.preview_token == payload.preview_token
        ),
        None,
    )
    if matching is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="반복 후보나 설정이 변경되었습니다. 미리보기를 다시 확인해 주세요.",
        )
    _item, rows = matching
    eligible_ids = {row.id for row in rows}
    scope = payload.apply_scope or settings.default_apply_scope
    selected_ids = set(payload.transaction_ids or [])
    if scope == "reviewed_only":
        if not selected_ids or not selected_ids <= eligible_ids:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="확인한 미리보기 거래 ID를 선택해 주세요.",
            )
    else:
        if payload.transaction_ids is not None and selected_ids != eligible_ids:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="전체 적용 대상이 미리보기와 다릅니다. 다시 확인해 주세요.",
            )
        selected_ids = eligible_ids
    for row in rows:
        if row.id in selected_ids:
            row.recurring_payment_kind = payload.proposed_kind
    await db_session.commit()
    return ApplyResult(updated=len(selected_ids))


async def _recurring_proposals(
    db_session: AsyncSession,
    *,
    lock: bool = False,
    require_upload_enabled: bool = False,
) -> tuple[
    list[tuple[RecurringDryRunItem, list[Transaction]]], RecurringDryRunSettings
]:
    if lock:
        await lock_recurring_configuration(db_session)
    analytics_settings = await get_analytics_settings(db_session)
    settings = analytics_settings.effective.recurring_dry_run
    if require_upload_enabled and not settings.upload_auto_apply:
        return [], settings
    saved_scope = analytics_settings.saved.recurring_dry_run.default_apply_scope
    unsupported_saved_scope = saved_scope is not None and saved_scope not in {
        "all_matching",
        "reviewed_only",
    }
    rules = await _load_recurring_category_rules(db_session)
    transactions = await _load_recurring_evidence_transactions(db_session, lock=lock)
    # Separate proposed kinds before detecting cadence. Unrelated categories,
    # refunds, and explicit contrary classifications cannot establish evidence.
    grouped: dict[tuple[str, str], list[Transaction]] = defaultdict(list)
    for transaction in transactions:
        rule = _match_recurring_category_rule(transaction, rules)
        if rule is None or transaction.recurring_payment_kind not in {
            None,
            rule.recurring_payment_kind,
        }:
            continue
        grouped[(transaction.merchant, rule.recurring_payment_kind)].append(transaction)

    candidates: list[tuple[RecurringDryRunItem, list[Transaction]]] = []
    for (merchant, kind), evidence in grouped.items():
        confidence = _recurring_confidence(evidence, settings)
        pending = [row for row in evidence if row.recurring_payment_kind is None]
        if confidence is None or not pending:
            continue
        matched_rules = [_match_recurring_category_rule(row, rules) for row in evidence]
        token_state = {
            "settings": settings.model_dump(),
            "saved_settings": analytics_settings.saved.recurring_dry_run.model_dump(),
            "merchant": merchant,
            "kind": kind,
            "evidence": [
                [
                    row.id,
                    row.date.isoformat(),
                    row.time.isoformat(),
                    row.amount,
                    row.category_major_user or row.category_major,
                    row.category_minor_user or row.category_minor,
                    row.recurring_payment_kind,
                    row.cost_kind,
                    rule.id,
                    str(rule.updated_at),
                ]
                for row, rule in zip(evidence, matched_rules, strict=True)
            ],
        }
        token = hashlib.sha256(
            json.dumps(token_state, sort_keys=True, ensure_ascii=False).encode()
        ).hexdigest()
        item = RecurringDryRunItem(
            merchant=merchant,
            proposed_kind=kind,
            confidence=round(confidence, 4),
            matched_transactions=[
                RecurringDryRunMatchedTransaction(
                    id=row.id, date=row.date.isoformat(), amount=row.amount
                )
                for row in pending
            ],
            reason=(
                "카테고리, 관측 횟수, 결제 간격과 금액 변동 기준이 일치합니다."
                + (
                    " 저장된 기본 적용 범위는 지원되지 않아 확인한 거래만 적용합니다. 설정을 수정해 주세요."
                    if unsupported_saved_scope
                    else ""
                )
            ),
            category_hint=", ".join(
                sorted(
                    {row.category_major_user or row.category_major for row in pending}
                )
            ),
            apply_scope_options=["all_matching", "reviewed_only"],
            default_apply_scope=settings.default_apply_scope,
            preview_token=token,
        )
        candidates.append((item, pending))
    candidates.sort(
        key=lambda candidate: (
            -candidate[0].confidence,
            candidate[0].merchant,
            candidate[0].proposed_kind,
        )
    )
    return candidates, settings


def _recurring_confidence(
    rows: list[Transaction], settings: RecurringDryRunSettings
) -> float | None:
    dates = sorted({row.date for row in rows})
    months = {_month_start(value) for value in dates}
    cv = _coefficient_of_variation([abs(row.amount) for row in rows])
    if (
        len(rows) < settings.min_occurrences
        or len(dates) < settings.min_distinct_days
        or len(months) < settings.min_distinct_months
        or cv > settings.max_amount_cv
    ):
        return None
    intervals = [(later - earlier).days for earlier, later in zip(dates, dates[1:])]
    if not intervals:
        return None
    monthly = all(
        settings.monthly_interval_days_min <= days <= settings.monthly_interval_days_max
        for days in intervals
    )
    weekly = all(
        settings.weekly_interval_days_min <= days <= settings.weekly_interval_days_max
        for days in intervals
    )
    confidence = max(0.0, 1.0 - cv)
    if not (monthly or weekly) or confidence < settings.minimum_confidence:
        return None
    return confidence


async def apply_enabled_auto_classification_after_upload(
    db_session: AsyncSession,
) -> None:
    settings = await get_auto_classification_settings(db_session)
    if settings.apply_cost_rules_on_upload:
        await apply_category_classification_rules(db_session)
    if settings.apply_loan_rules_on_upload:
        await apply_loan_merchant_rules(db_session)
    # Recheck the upload preference under the same configuration lock used by
    # approvals; earlier cost/loan operations may have committed in the meantime.
    await apply_recurring_category_rules(db_session, require_upload_enabled=True)


async def _load_recurring_evidence_transactions(
    db_session: AsyncSession,
    *,
    lock: bool = False,
) -> list[Transaction]:
    query = (
        select(Transaction)
        .where(Transaction.type == "지출", Transaction.amount < 0)
        .where(Transaction.is_deleted.is_(False))
        .where(Transaction.merged_into_id.is_(None))
        .order_by(Transaction.date.asc(), Transaction.time.asc(), Transaction.id.asc())
    )
    if lock:
        # Match ORM bulk flush primary-key order to avoid locking the same two
        # rows in opposite orders when import order differs from transaction date.
        query = (
            query.order_by(None)
            .order_by(Transaction.id.asc())
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    result = await db_session.execute(query)
    # Evidence, display and preview tokens retain their chronological order.
    return sorted(result.scalars().all(), key=lambda row: (row.date, row.time, row.id))


async def _valid_category_keys(db_session: AsyncSession) -> set[tuple[str, str | None]]:
    canonical = build_transactions_effective_select().subquery()
    result = await db_session.execute(
        select(
            canonical.c.effective_category_major, canonical.c.effective_category_minor
        )
        .where(canonical.c.type == "지출")
        .distinct()
    )
    keys = {(major, minor) for major, minor in result.all() if major and major.strip()}
    return keys | {(major, None) for major, _minor in keys}


def _category_is_valid(rule, keys: set[tuple[str, str | None]]) -> bool:
    return (rule.category_major, rule.category_minor) in keys


async def _validate_category(
    db_session: AsyncSession, major: str, minor: str | None
) -> None:
    if (major, minor) not in await _valid_category_keys(db_session):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="현재 지출 거래에 있는 대분류·소분류 조합을 선택해 주세요.",
        )


async def _load_category_rule(
    db_session: AsyncSession,
    *,
    category_major: str,
    category_minor: str | None,
) -> CategoryClassificationRule | None:
    query = select(CategoryClassificationRule).where(
        CategoryClassificationRule.category_major == category_major
    )
    if category_minor is None:
        query = query.where(CategoryClassificationRule.category_minor.is_(None))
    else:
        query = query.where(CategoryClassificationRule.category_minor == category_minor)
    return await db_session.scalar(query)


async def _load_recurring_category_rule(
    db_session: AsyncSession,
    *,
    category_major: str,
    category_minor: str | None,
) -> RecurringCategoryRule | None:
    query = select(RecurringCategoryRule).where(
        RecurringCategoryRule.category_major == category_major
    )
    if category_minor is None:
        query = query.where(RecurringCategoryRule.category_minor.is_(None))
    else:
        query = query.where(RecurringCategoryRule.category_minor == category_minor)
    return await db_session.scalar(query.execution_options(populate_existing=True))


async def _load_category_rules(
    db_session: AsyncSession,
) -> dict[tuple[str, str | None], CategoryClassificationRule]:
    result = await db_session.execute(select(CategoryClassificationRule))
    return {
        (rule.category_major, rule.category_minor): rule
        for rule in result.scalars().all()
    }


def _match_category_rule(
    transaction: Transaction,
    rules: dict[tuple[str, str | None], CategoryClassificationRule],
) -> CategoryClassificationRule | None:
    category_major = transaction.category_major_user or transaction.category_major
    category_minor = transaction.category_minor_user or transaction.category_minor
    return rules.get((category_major, category_minor)) or rules.get(
        (category_major, None)
    )


def _normalized_necessity_pair(
    *,
    cost_kind: str,
    fixed_cost_necessity: str | None,
    spend_necessity: str | None,
) -> tuple[str | None, str | None]:
    explicit_spend_necessity = (
        spend_necessity if spend_necessity in {"essential", "discretionary"} else None
    )
    explicit_fixed_necessity = (
        fixed_cost_necessity
        if fixed_cost_necessity in {"essential", "discretionary"}
        else None
    )
    if cost_kind == "fixed":
        normalized = explicit_spend_necessity or explicit_fixed_necessity
        return normalized, normalized
    return None, explicit_spend_necessity or "discretionary"


async def _load_recurring_category_rules(
    db_session: AsyncSession,
) -> dict[tuple[str, str | None], RecurringCategoryRule]:
    result = await db_session.execute(
        select(RecurringCategoryRule).execution_options(populate_existing=True)
    )
    return {
        (rule.category_major, rule.category_minor): rule
        for rule in result.scalars().all()
    }


def _match_recurring_category_rule(
    transaction: Transaction,
    rules: dict[tuple[str, str | None], RecurringCategoryRule],
) -> RecurringCategoryRule | None:
    category_major = transaction.category_major_user or transaction.category_major
    category_minor = transaction.category_minor_user or transaction.category_minor
    return rules.get((category_major, category_minor)) or rules.get(
        (category_major, None)
    )


def _month_start(value: date) -> date:
    return date(value.year, value.month, 1)


def _coefficient_of_variation(values: list[int]) -> float:
    if not values:
        return 0.0
    avg = sum(values) / len(values)
    if avg <= 0:
        return 0.0
    variance = sum((value - avg) ** 2 for value in values) / len(values)
    return math.sqrt(variance) / avg


def _serialize_category_rule(
    rule: CategoryClassificationRule,
    *,
    category_valid: bool = True,
) -> CategoryClassificationRuleResponse:
    return CategoryClassificationRuleResponse(
        category_valid=category_valid,
        validation_message=None
        if category_valid
        else "현재 지출 분류에 없는 규칙입니다.",
        id=rule.id,
        category_major=rule.category_major,
        category_minor=rule.category_minor,
        cost_kind=rule.cost_kind,
        fixed_cost_necessity=rule.fixed_cost_necessity,
        spend_necessity=rule.spend_necessity,
        created_at=rule.created_at,
        updated_at=rule.updated_at,
    )


def _serialize_merchant_alias_rule(
    rule: MerchantAliasRule,
) -> MerchantAliasRuleResponse:
    return MerchantAliasRuleResponse(
        id=rule.id,
        alias_pattern=rule.alias_pattern,
        normalized_merchant=rule.normalized_merchant,
        created_at=rule.created_at,
        updated_at=rule.updated_at,
    )


def _serialize_loan_merchant_rule(
    rule: LoanMerchantRule,
    account: LoanAccount,
) -> LoanMerchantRuleResponse:
    return LoanMerchantRuleResponse(
        id=rule.id,
        merchant=rule.merchant,
        match_field=rule.match_field,
        loan_account_id=account.id,
        lender=account.lender,
        product_name=account.product_name,
        display_name=account.display_name_user
        or f"{account.lender} {account.product_name}",
        repayment_type=rule.repayment_type,
        memo=rule.memo,
        created_at=rule.created_at,
        updated_at=rule.updated_at,
    )


def _serialize_recurring_category_rule(
    rule: RecurringCategoryRule,
    *,
    category_valid: bool = True,
) -> RecurringCategoryRuleResponse:
    return RecurringCategoryRuleResponse(
        category_valid=category_valid,
        validation_message=None
        if category_valid
        else "현재 지출 분류에 없는 규칙입니다.",
        id=rule.id,
        category_major=rule.category_major,
        category_minor=rule.category_minor,
        recurring_payment_kind=rule.recurring_payment_kind,
        created_at=rule.created_at,
        updated_at=rule.updated_at,
    )


def _normalize_optional_text(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip()
    return normalized or None


def _normalized_merchant_for_rules(
    description: str,
    rules: list[MerchantAliasRule],
) -> str | None:
    description_casefold = description.casefold()
    for rule in rules:
        if rule.alias_pattern.casefold() in description_casefold:
            return rule.normalized_merchant
    return None
