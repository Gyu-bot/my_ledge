from datetime import date, time

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.auto_classification import (
    CategoryClassificationRule,
    LoanMerchantRule,
    MerchantAliasRule,
    RecurringCategoryRule,
)
from app.models.loan_account import LoanAccount
from app.models.loan_transaction_link import LoanTransactionLink
from app.models.transaction import Transaction
from app.services.auto_classification_service import (
    apply_category_classification_rules,
    apply_loan_merchant_rules,
    apply_recurring_category_rules,
    get_auto_classification_settings,
)


def _transaction(
    *,
    category_major: str,
    category_minor: str | None,
    merchant: str,
    description: str | None = None,
    tx_date: date = date(2026, 5, 20),
    cost_classification_source: str | None = None,
    recurring_payment_kind: str | None = None,
) -> Transaction:
    return Transaction(
        date=tx_date,
        time=time(9, 0),
        type="지출",
        category_major=category_major,
        category_minor=category_minor,
        description=description or merchant,
        merchant=merchant,
        amount=-100000,
        currency="KRW",
        payment_method="카드",
        cost_classification_source=cost_classification_source,
        recurring_payment_kind=recurring_payment_kind,
        source="import",
    )


async def test_category_rules_apply_to_unmodified_transactions_only(
    db_session: AsyncSession,
) -> None:
    auto_target = _transaction(
        category_major="통신",
        category_minor="휴대폰",
        merchant="통신사",
    )
    manual_target = _transaction(
        category_major="통신",
        category_minor="휴대폰",
        merchant="수동 통신사",
        cost_classification_source="manual",
    )
    manual_target.cost_kind = "variable"
    db_session.add_all(
        [
            auto_target,
            manual_target,
            CategoryClassificationRule(
                category_major="통신",
                category_minor="휴대폰",
                cost_kind="fixed",
                fixed_cost_necessity="essential",
                spend_necessity="essential",
            ),
        ]
    )
    await db_session.commit()

    result = await apply_category_classification_rules(db_session)

    assert result.updated == 1
    await db_session.refresh(auto_target)
    await db_session.refresh(manual_target)
    assert auto_target.cost_kind == "fixed"
    assert auto_target.fixed_cost_necessity == "essential"
    assert auto_target.spend_necessity == "essential"
    assert auto_target.cost_classification_source == "auto"
    assert manual_target.cost_kind == "variable"
    assert manual_target.cost_classification_source == "manual"


async def test_major_level_category_rule_is_used_when_minor_rule_is_absent(
    db_session: AsyncSession,
) -> None:
    transaction = _transaction(
        category_major="식비",
        category_minor="외식",
        merchant="식당",
    )
    db_session.add_all(
        [
            transaction,
            CategoryClassificationRule(
                category_major="식비",
                category_minor=None,
                cost_kind="variable",
                fixed_cost_necessity=None,
                spend_necessity="essential",
            ),
        ]
    )
    await db_session.commit()

    result = await apply_category_classification_rules(db_session)

    assert result.updated == 1
    await db_session.refresh(transaction)
    assert transaction.cost_kind == "variable"
    assert transaction.fixed_cost_necessity is None
    assert transaction.spend_necessity == "essential"
    assert transaction.cost_classification_source == "auto"


async def test_merchant_alias_rules_normalize_transaction_merchants(
    db_session: AsyncSession,
) -> None:
    transaction = _transaction(
        category_major="생활",
        category_minor="쇼핑",
        merchant="쿠팡 주식회사",
    )
    db_session.add_all(
        [
            transaction,
            MerchantAliasRule(
                alias_pattern="쿠팡",
                normalized_merchant="쿠팡",
            ),
        ]
    )
    await db_session.commit()

    from app.services.auto_classification_service import apply_merchant_alias_rules

    result = await apply_merchant_alias_rules(db_session)

    assert result.updated == 1
    await db_session.refresh(transaction)
    assert transaction.merchant == "쿠팡"


async def test_merchant_alias_rules_match_raw_description_and_preserve_manual_merchants(
    db_session: AsyncSession,
) -> None:
    default_merchant = _transaction(
        category_major="생활",
        category_minor="결제",
        description="네이버페이 결제",
        merchant="네이버페이 결제",
    )
    manual_merchant = _transaction(
        category_major="생활",
        category_minor="결제",
        description="직접 입력한 원본",
        merchant="네이버페이 내가 정한 거래처",
    )
    db_session.add_all(
        [
            default_merchant,
            manual_merchant,
            MerchantAliasRule(
                alias_pattern="네이버페이",
                normalized_merchant="네이버페이",
            ),
        ]
    )
    await db_session.commit()

    from app.services.auto_classification_service import apply_merchant_alias_rules

    result = await apply_merchant_alias_rules(db_session)

    assert result.updated == 1
    await db_session.refresh(default_merchant)
    await db_session.refresh(manual_merchant)
    assert default_merchant.merchant == "네이버페이"
    assert manual_merchant.merchant == "네이버페이 내가 정한 거래처"


async def test_loan_merchant_rules_create_auto_links_without_overwriting_manual_links(
    db_session: AsyncSession,
) -> None:
    account = LoanAccount(lender="국민은행", product_name="주택담보대출")
    auto_target = _transaction(
        category_major="금융",
        category_minor="대출상환",
        merchant="국민은행",
    )
    manual_target = _transaction(
        category_major="금융",
        category_minor="대출상환",
        merchant="국민은행",
    )
    db_session.add_all([account, auto_target, manual_target])
    await db_session.flush()
    db_session.add_all(
        [
            LoanTransactionLink(
                transaction_id=manual_target.id,
                loan_account_id=account.id,
                repayment_type="interest",
                source="manual",
            ),
            LoanMerchantRule(
                merchant="국민은행",
                loan_account_id=account.id,
                repayment_type="mixed",
                memo="자동 원리금",
            ),
        ]
    )
    await db_session.commit()

    result = await apply_loan_merchant_rules(db_session)

    assert result.updated == 1
    links = (
        await db_session.execute(
            select(LoanTransactionLink).order_by(LoanTransactionLink.transaction_id)
        )
    ).scalars().all()
    assert len(links) == 2
    auto_link = next(link for link in links if link.transaction_id == auto_target.id)
    manual_link = next(link for link in links if link.transaction_id == manual_target.id)
    assert auto_link.source == "auto"
    assert auto_link.repayment_type == "mixed"
    assert auto_link.memo == "자동 원리금"
    assert manual_link.source == "manual"
    assert manual_link.repayment_type == "interest"


async def test_loan_merchant_rules_can_match_original_description(
    db_session: AsyncSession,
) -> None:
    account = LoanAccount(lender="국민은행", product_name="주택담보대출")
    target = _transaction(
        category_major="금융",
        category_minor="대출상환",
        description="국민은행 원리금 자동이체",
        merchant="국민은행 주담대",
    )
    db_session.add_all([account, target])
    await db_session.flush()
    db_session.add(
        LoanMerchantRule(
            merchant="국민은행 원리금 자동이체",
            match_field="description",
            loan_account_id=account.id,
            repayment_type="mixed",
        )
    )
    await db_session.commit()

    result = await apply_loan_merchant_rules(db_session)

    assert result.updated == 1
    link = await db_session.scalar(
        select(LoanTransactionLink).where(
            LoanTransactionLink.transaction_id == target.id
        )
    )
    assert link is not None
    assert link.loan_account_id == account.id
    assert link.source == "auto"


async def test_recurring_category_rules_apply_to_recurring_candidates_only(
    db_session: AsyncSession,
) -> None:
    monthly_targets = [
        _transaction(
            tx_date=date(2026, month, 5),
            category_major="구독",
            category_minor="OTT",
            merchant="넷플릭스",
        )
        for month in (1, 2, 3)
    ]
    one_off = _transaction(
        tx_date=date(2026, 1, 10),
        category_major="구독",
        category_minor="OTT",
        merchant="일회성구독",
    )
    manual_target = _transaction(
        tx_date=date(2026, 1, 5),
        category_major="구독",
        category_minor="OTT",
        merchant="수동구독",
        recurring_payment_kind="not_recurring",
    )
    db_session.add_all(
        [
            *monthly_targets,
            one_off,
            manual_target,
            RecurringCategoryRule(
                category_major="구독",
                category_minor=None,
                recurring_payment_kind="monthly_recurring",
            ),
        ]
    )
    await db_session.commit()

    result = await apply_recurring_category_rules(db_session)

    assert result.updated == 3
    for transaction in monthly_targets:
        await db_session.refresh(transaction)
        assert transaction.recurring_payment_kind == "monthly_recurring"
    await db_session.refresh(one_off)
    await db_session.refresh(manual_target)
    assert one_off.recurring_payment_kind is None
    assert manual_target.recurring_payment_kind == "not_recurring"


async def test_auto_classification_settings_default_to_disabled(
    db_session: AsyncSession,
) -> None:
    settings = await get_auto_classification_settings(db_session)

    assert settings.apply_cost_rules_on_upload is False
    assert settings.apply_loan_rules_on_upload is False
    assert settings.apply_recurring_rules_on_upload is False
