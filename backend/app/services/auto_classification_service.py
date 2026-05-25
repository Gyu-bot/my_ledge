from dataclasses import dataclass

from fastapi import HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.auto_classification import (
    AutoClassificationSettings,
    CategoryClassificationRule,
    LoanMerchantRule,
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
    rule.fixed_cost_necessity = (
        payload.fixed_cost_necessity if payload.cost_kind == "fixed" else None
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
            and transaction.cost_classification_source == "auto"
        ):
            continue
        transaction.cost_kind = rule.cost_kind
        transaction.fixed_cost_necessity = rule.fixed_cost_necessity
        transaction.cost_classification_source = "auto"
        updated += 1

    await db_session.commit()
    return ApplyResult(updated=updated)


async def list_loan_merchant_rules(
    db_session: AsyncSession,
) -> LoanMerchantRuleListResponse:
    result = await db_session.execute(
        select(LoanMerchantRule, LoanAccount)
        .join(LoanAccount, LoanMerchantRule.loan_account_id == LoanAccount.id)
        .order_by(LoanMerchantRule.merchant)
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
        select(LoanMerchantRule).where(LoanMerchantRule.merchant == merchant)
    )
    if rule is None:
        rule = LoanMerchantRule(
            merchant=merchant,
            loan_account_id=account.id,
        )
        db_session.add(rule)

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
    rules = {rule.merchant: rule for rule, _account in result.all()}
    if not rules:
        return ApplyResult(updated=0)

    rows = await db_session.execute(
        select(Transaction, LoanTransactionLink)
        .outerjoin(
            LoanTransactionLink,
            LoanTransactionLink.transaction_id == Transaction.id,
        )
        .where(Transaction.type == "지출")
        .where(Transaction.is_deleted.is_(False))
        .where(Transaction.merged_into_id.is_(None))
        .where(Transaction.merchant.in_(list(rules)))
    )

    updated = 0
    for transaction, link in rows.all():
        if link is not None and link.source == "manual":
            continue
        rule = rules.get(transaction.merchant)
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


async def apply_enabled_auto_classification_after_upload(
    db_session: AsyncSession,
) -> None:
    settings = await get_auto_classification_settings(db_session)
    if settings.apply_cost_rules_on_upload:
        await apply_category_classification_rules(db_session)
    if settings.apply_loan_rules_on_upload:
        await apply_loan_merchant_rules(db_session)


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


def _serialize_category_rule(
    rule: CategoryClassificationRule,
) -> CategoryClassificationRuleResponse:
    return CategoryClassificationRuleResponse(
        id=rule.id,
        category_major=rule.category_major,
        category_minor=rule.category_minor,
        cost_kind=rule.cost_kind,
        fixed_cost_necessity=rule.fixed_cost_necessity,
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
        loan_account_id=account.id,
        lender=account.lender,
        product_name=account.product_name,
        display_name=f"{account.lender} {account.product_name}",
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
