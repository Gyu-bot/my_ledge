"""승인 미리보기용 읽기 전용 거래·등록 대출 규칙 투영.

실제 연결 적용과 같은 거래처 우선/원문 차선 규칙을 사용하고 수동 연결은
보존한다. 가상 추가 행은 음수 식별자만 사용하므로 DB 시퀀스도 변경하지 않는다.
"""

from sqlalchemy import case, literal, select, union_all

from app.models.auto_classification import LoanMerchantRule
from app.models.loan_transaction_link import LoanTransactionLink
from app.models.transaction import Transaction


def repayment_preview_sources(
    transaction_overrides=None, *, transaction_additions=(), apply_loan_rules=False
):
    stored = Transaction.__table__
    overrides = transaction_overrides or {}
    expressions = []
    for field in stored.c:
        changes = {
            transaction_id: values[field.name]
            for transaction_id, values in overrides.items()
            if field.name in values
        }
        expressions.append(
            case(changes, value=stored.c.id, else_=field).label(field.name)
            if changes
            else field
        )
    rows = [select(*expressions)]
    for index, values in enumerate(transaction_additions, 1):
        values = {"id": -index, "is_deleted": False, **values}
        rows.append(
            select(
                *[
                    literal(values.get(field.name), type_=field.type).label(field.name)
                    for field in stored.c
                ]
            )
        )
    transactions = union_all(*rows).cte("preview_transactions")
    links = LoanTransactionLink.__table__
    if not apply_loan_rules:
        return transactions, links
    rules = LoanMerchantRule.__table__
    # 사람이 등록한 규칙만 사용하며 이력 추론은 적용하지 않는다.
    match = (
        select(rules.c.id)
        .where(
            (
                (rules.c.match_field == "merchant")
                & (rules.c.merchant == transactions.c.merchant)
            )
            | (
                (rules.c.match_field == "description")
                & (rules.c.merchant == transactions.c.description)
            )
        )
        .order_by(case((rules.c.match_field == "merchant", 0), else_=1))
        .limit(1)
        .correlate(transactions)
        .scalar_subquery()
    )
    use_rule = (
        (transactions.c.type == "지출")
        & (transactions.c.is_deleted.is_(False))
        & (transactions.c.merged_into_id.is_(None))
        & ((links.c.id.is_(None)) | (links.c.source != "manual"))
        & rules.c.id.is_not(None)
    )
    projected = (
        select(
            transactions.c.id.label("transaction_id"),
            case(
                (use_rule, rules.c.loan_account_id), else_=links.c.loan_account_id
            ).label("loan_account_id"),
            case(
                (use_rule, rules.c.repayment_type), else_=links.c.repayment_type
            ).label("repayment_type"),
        )
        .select_from(
            transactions.outerjoin(
                links, links.c.transaction_id == transactions.c.id
            ).outerjoin(rules, rules.c.id == match)
        )
        .cte("preview_loan_links")
    )
    return transactions, projected
