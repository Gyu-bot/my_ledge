from collections import defaultdict
from dataclasses import dataclass
from datetime import date
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
    settings = await db_session.get(AutoClassificationSettings, 1)
    if settings is not None:
        return settings
    return AutoClassificationSettings(
        id=1,
        apply_cost_rules_on_upload=False,
        apply_loan_rules_on_upload=False,
        apply_recurring_rules_on_upload=False,
    )


async def patch_auto_classification_settings(
    db_session: AsyncSession,
    payload: AutoClassificationSettingsPatchRequest,
) -> AutoClassificationSettings:
    settings = await db_session.get(AutoClassificationSettings, 1)
    if settings is None:
        settings = AutoClassificationSettings(id=1)
        db_session.add(settings)

    update_fields = payload.model_dump(exclude_unset=True)
    for field, value in update_fields.items():
        if value is not None:
            setattr(settings, field, value)

    await db_session.commit()
    await db_session.refresh(settings)
    return settings


async def list_category_classification_rules(
    db_session: AsyncSession,
) -> CategoryClassificationRuleListResponse:
    result = await db_session.execute(
        select(CategoryClassificationRule).order_by(
            CategoryClassificationRule.category_major,
            CategoryClassificationRule.category_minor,
        )
    )
    return CategoryClassificationRuleListResponse(
        items=[
            _serialize_category_rule(rule)
            for rule in result.scalars().all()
        ]
    )


async def upsert_category_classification_rule(
    db_session: AsyncSession,
    payload: CategoryClassificationRuleRequest,
) -> CategoryClassificationRuleResponse:
    category_major = payload.category_major.strip()
    category_minor = _normalize_optional_text(payload.category_minor)
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
        items=[
            _serialize_merchant_alias_rule(rule)
            for rule in result.scalars().all()
        ]
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
        select(LoanMerchantRule, LoanAccount)
        .join(LoanAccount, LoanMerchantRule.loan_account_id == LoanAccount.id)
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
        link.loan_account_id = rule.loan_account_id
        link.repayment_type = rule.repayment_type
        link.memo = rule.memo
        link.source = "auto"
        updated += 1

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
    return RecurringCategoryRuleListResponse(
        items=[
            _serialize_recurring_category_rule(rule)
            for rule in result.scalars().all()
        ]
    )


async def upsert_recurring_category_rule(
    db_session: AsyncSession,
    payload: RecurringCategoryRuleRequest,
) -> RecurringCategoryRuleResponse:
    category_major = payload.category_major.strip()
    category_minor = _normalize_optional_text(payload.category_minor)
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
    rule = await db_session.get(RecurringCategoryRule, rule_id)
    if rule is None:
        return False
    await db_session.delete(rule)
    await db_session.commit()
    return True


async def apply_recurring_category_rules(
    db_session: AsyncSession,
) -> ApplyResult:
    rules = await _load_recurring_category_rules(db_session)
    if not rules:
        return ApplyResult(updated=0)

    result = await db_session.execute(
        select(Transaction)
        .where(Transaction.type == "지출")
        .where(Transaction.is_deleted.is_(False))
        .where(Transaction.merged_into_id.is_(None))
        .where(Transaction.recurring_payment_kind.is_(None))
    )
    transactions = result.scalars().all()
    recurring_candidates = _recurring_candidate_merchants(transactions)
    updated = 0
    for transaction in transactions:
        rule = _match_recurring_category_rule(transaction, rules)
        if rule is None:
            continue
        if transaction.merchant not in recurring_candidates and transaction.cost_kind != "fixed":
            continue
        transaction.recurring_payment_kind = rule.recurring_payment_kind
        updated += 1

    await db_session.commit()
    return ApplyResult(updated=updated)


async def dry_run_recurring_category_rules(
    db_session: AsyncSession,
) -> RecurringDryRunResponse:
    rules = await _load_recurring_category_rules(db_session)
    if not rules:
        return RecurringDryRunResponse(items=[])
    transactions = await _load_unclassified_recurring_transactions(db_session)
    recurring_candidates = _recurring_candidate_merchants(transactions)
    grouped: dict[str, list[Transaction]] = defaultdict(list)
    for transaction in transactions:
        rule = _match_recurring_category_rule(transaction, rules)
        if rule is None:
            continue
        if transaction.merchant not in recurring_candidates and transaction.cost_kind != "fixed":
            continue
        grouped[transaction.merchant].append(transaction)

    items: list[RecurringDryRunItem] = []
    for merchant, rows in grouped.items():
        rows.sort(key=lambda row: (row.date, row.time, row.id))
        first_rule = _match_recurring_category_rule(rows[0], rules)
        if first_rule is None:
            continue
        category_hint = rows[0].category_major_user or rows[0].category_major
        amounts = [abs(row.amount) for row in rows]
        confidence = round(max(0.5, 1.0 - _coefficient_of_variation(amounts)), 4)
        items.append(
            RecurringDryRunItem(
                merchant=merchant,
                proposed_kind=first_rule.recurring_payment_kind,
                confidence=confidence,
                matched_transactions=[
                    RecurringDryRunMatchedTransaction(
                        id=row.id,
                        date=row.date.isoformat(),
                        amount=row.amount,
                    )
                    for row in rows
                ],
                reason="반복 후보 조건과 카테고리 힌트가 일치합니다.",
                category_hint=category_hint,
                apply_scope_options=["all_matching", "future_only"],
            )
        )
    items.sort(key=lambda item: (-item.confidence, item.merchant))
    return RecurringDryRunResponse(items=items)


async def apply_recurring_dry_run(
    db_session: AsyncSession,
    payload: RecurringDryRunApplyRequest,
) -> ApplyResult:
    if payload.apply_scope == "future_only":
        return ApplyResult(updated=0)

    transactions = await _load_unclassified_recurring_transactions(db_session)
    updated = 0
    for transaction in transactions:
        if transaction.merchant != payload.merchant:
            continue
        transaction.recurring_payment_kind = payload.proposed_kind
        updated += 1
    await db_session.commit()
    return ApplyResult(updated=updated)


async def apply_enabled_auto_classification_after_upload(
    db_session: AsyncSession,
) -> None:
    settings = await get_auto_classification_settings(db_session)
    if settings.apply_cost_rules_on_upload:
        await apply_category_classification_rules(db_session)
    if settings.apply_loan_rules_on_upload:
        await apply_loan_merchant_rules(db_session)
    if settings.apply_recurring_rules_on_upload:
        await apply_recurring_category_rules(db_session)


async def _load_unclassified_recurring_transactions(
    db_session: AsyncSession,
) -> list[Transaction]:
    result = await db_session.execute(
        select(Transaction)
        .where(Transaction.type == "지출")
        .where(Transaction.is_deleted.is_(False))
        .where(Transaction.merged_into_id.is_(None))
        .where(Transaction.recurring_payment_kind.is_(None))
        .order_by(Transaction.date.asc(), Transaction.time.asc(), Transaction.id.asc())
    )
    return list(result.scalars().all())


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
    return await db_session.scalar(query)


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
    return (
        rules.get((category_major, category_minor))
        or rules.get((category_major, None))
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
        normalized = explicit_fixed_necessity or explicit_spend_necessity
        return normalized, normalized
    return None, explicit_spend_necessity or "discretionary"


async def _load_recurring_category_rules(
    db_session: AsyncSession,
) -> dict[tuple[str, str | None], RecurringCategoryRule]:
    result = await db_session.execute(select(RecurringCategoryRule))
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
    return (
        rules.get((category_major, category_minor))
        or rules.get((category_major, None))
    )


def _recurring_candidate_merchants(transactions: list[Transaction]) -> set[str]:
    merchant_rows: dict[str, list[Transaction]] = defaultdict(list)
    for transaction in transactions:
        merchant_rows[transaction.merchant].append(transaction)

    candidates: set[str] = set()
    for merchant, rows in merchant_rows.items():
        active_dates = {row.date for row in rows}
        active_months = {_month_start(row.date) for row in rows}
        amounts = [abs(row.amount) for row in rows]
        if (
            len(active_months) >= 2
            and len(active_dates) >= 2
            and _coefficient_of_variation(amounts) <= 0.5
        ):
            candidates.add(merchant)
    return candidates


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
) -> CategoryClassificationRuleResponse:
    return CategoryClassificationRuleResponse(
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
        display_name=account.display_name_user or f"{account.lender} {account.product_name}",
        repayment_type=rule.repayment_type,
        memo=rule.memo,
        created_at=rule.created_at,
        updated_at=rule.updated_at,
    )


def _serialize_recurring_category_rule(
    rule: RecurringCategoryRule,
) -> RecurringCategoryRuleResponse:
    return RecurringCategoryRuleResponse(
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
