"""Registered loan rules match the merchant first, then raw description."""

from collections.abc import Iterable

from app.models.auto_classification import LoanMerchantRule

LOAN_RULE_MATCH_FIELDS = ("merchant", "description")


def index_loan_rules(
    rules: Iterable[LoanMerchantRule],
) -> dict[str, dict[str, LoanMerchantRule]]:
    indexed: dict[str, dict[str, LoanMerchantRule]] = {
        field: {} for field in LOAN_RULE_MATCH_FIELDS
    }
    for rule in rules:
        field = "description" if rule.match_field == "description" else "merchant"
        indexed[field][rule.merchant] = rule
    return indexed


def matching_loan_rule(
    rules: dict[str, dict[str, LoanMerchantRule]],
    *,
    merchant: str | None,
    description: str | None,
) -> LoanMerchantRule | None:
    for field, value in zip(LOAN_RULE_MATCH_FIELDS, (merchant, description)):
        if value is not None and (rule := rules[field].get(value)) is not None:
            return rule
    return None
