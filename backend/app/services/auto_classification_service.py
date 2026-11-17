from dataclasses import dataclass

from fastapi import HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.auto_classification import (
    AutoClassificationSettings,
    LoanMerchantRule,
    MerchantAliasRule,
)
from app.models.loan_account import LoanAccount
from app.models.loan_transaction_link import LoanTransactionLink
from app.models.transaction import Transaction
from app.services.canonical_views import build_transactions_effective_select
from app.schemas.auto_classification import (
    AutoClassificationSettingsPatchRequest,
    LoanMerchantRuleListResponse,
    LoanMerchantRuleRequest,
    LoanMerchantRuleResponse,
    MerchantAliasRuleListResponse,
    MerchantAliasRuleRequest,
    MerchantAliasRuleResponse,
)


@dataclass(slots=True)
class ApplyResult:
    updated: int


async def get_auto_classification_settings(
    db_session: AsyncSession,
) -> AutoClassificationSettings:
    stored = await db_session.get(AutoClassificationSettings, 1, populate_existing=True)
    return AutoClassificationSettings(
        id=1,
        apply_loan_rules_on_upload=stored.apply_loan_rules_on_upload
        if stored
        else True,
    )


async def patch_auto_classification_settings(
    db_session: AsyncSession,
    payload: AutoClassificationSettingsPatchRequest,
) -> AutoClassificationSettings:
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

    await db_session.commit()
    return await get_auto_classification_settings(db_session)


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
    *,
    commit: bool = True,
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
    if commit:
        await db_session.commit()
    else:
        await db_session.flush()
    return ApplyResult(updated=updated)


async def apply_enabled_auto_classification_after_upload(
    db_session: AsyncSession,
) -> None:
    settings = await get_auto_classification_settings(db_session)
    if settings.apply_loan_rules_on_upload:
        await apply_loan_merchant_rules(db_session, commit=False)


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
