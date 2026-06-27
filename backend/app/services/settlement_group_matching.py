from dataclasses import dataclass
import re

from app.models.settlement_group import SettlementMatch, SettlementMatchStatus
from app.models.transaction import Transaction


MAX_MATCH_DAYS = 14
TOKEN_PATTERN = re.compile(r"[\W_]+", re.UNICODE)


@dataclass(frozen=True, slots=True)
class SettlementGroupSnapshot:
    status: SettlementMatchStatus
    original_transaction_id: int | None
    candidate_original_transaction_ids: tuple[int, ...]
    refund_transaction_ids: tuple[int, ...]
    gross_amount: int | None
    refund_total: int | None
    net_amount: int | None


def candidate_purchases(
    *,
    refund: Transaction,
    purchases: list[Transaction],
    rejected_pairs: set[tuple[int, int]],
    allocated_by_purchase: dict[int, int],
    purchase_amounts: dict[int, int],
) -> list[Transaction]:
    refund_payment_method = normalized_optional_text(refund.payment_method)
    refund_currency = normalized_currency(refund.currency)
    if refund_payment_method is None or refund_currency is None:
        return []
    refund_merchant = normalized_party(refund.merchant, refund.description)
    candidates_with_score: list[tuple[int, Transaction]] = []
    for purchase in purchases:
        if (purchase.id, refund.id) in rejected_pairs:
            continue
        if purchase.date > refund.date:
            continue
        day_gap = (refund.date - purchase.date).days
        if day_gap > MAX_MATCH_DAYS:
            continue
        if normalized_party(purchase.merchant, purchase.description) != refund_merchant:
            continue
        if normalized_optional_text(purchase.payment_method) != refund_payment_method:
            continue
        if normalized_currency(purchase.currency) != refund_currency:
            continue
        remaining_capacity = purchase_amounts[purchase.id] - allocated_by_purchase.get(
            purchase.id, 0
        )
        if refund.amount > remaining_capacity:
            continue
        candidates_with_score.append(
            (
                candidate_score(purchase=purchase, refund=refund, day_gap=day_gap),
                purchase,
            )
        )
    candidates_with_score.sort(key=lambda item: (-item[0], item[1].date, item[1].id))
    return [purchase for _, purchase in candidates_with_score]


def build_snapshots(
    *,
    transactions: list[Transaction],
    matches: list[SettlementMatch],
) -> list[SettlementGroupSnapshot]:
    transactions_by_id = {transaction.id: transaction for transaction in transactions}
    confirmed_by_original: dict[int, list[SettlementMatch]] = {}
    review_by_refund: dict[int, list[SettlementMatch]] = {}
    for match in matches:
        if match.status in {
            SettlementMatchStatus.AUTO_CONFIRMED.value,
            SettlementMatchStatus.USER_CONFIRMED.value,
        }:
            confirmed_by_original.setdefault(match.original_transaction_id, []).append(
                match
            )
            continue
        if match.status == SettlementMatchStatus.REVIEW_REQUIRED.value:
            review_by_refund.setdefault(match.settlement_transaction_id, []).append(
                match
            )

    snapshots: list[SettlementGroupSnapshot] = []
    for original_id, original_matches in sorted(confirmed_by_original.items()):
        purchase = transactions_by_id.get(original_id)
        if purchase is None:
            continue
        refund_matches = sorted(
            original_matches,
            key=lambda match: (
                transactions_by_id[match.settlement_transaction_id].date,
                transactions_by_id[match.settlement_transaction_id].time,
                match.settlement_transaction_id,
            ),
        )
        status = SettlementMatchStatus.AUTO_CONFIRMED
        if any(
            match.status == SettlementMatchStatus.USER_CONFIRMED.value
            for match in refund_matches
        ):
            status = SettlementMatchStatus.USER_CONFIRMED
        refund_total = sum(match.matched_amount for match in refund_matches)
        snapshots.append(
            SettlementGroupSnapshot(
                status=status,
                original_transaction_id=original_id,
                candidate_original_transaction_ids=(original_id,),
                refund_transaction_ids=tuple(
                    match.settlement_transaction_id for match in refund_matches
                ),
                gross_amount=abs(purchase.amount),
                refund_total=refund_total,
                net_amount=max(0, abs(purchase.amount) - refund_total),
            )
        )

    for refund_id, refund_matches in sorted(review_by_refund.items()):
        candidate_ids = tuple(
            match.original_transaction_id
            for match in sorted(
                refund_matches,
                key=lambda match: (
                    transactions_by_id[match.original_transaction_id].date,
                    match.original_transaction_id,
                ),
            )
        )
        snapshots.append(
            SettlementGroupSnapshot(
                status=SettlementMatchStatus.REVIEW_REQUIRED,
                original_transaction_id=None,
                candidate_original_transaction_ids=candidate_ids,
                refund_transaction_ids=(refund_id,),
                gross_amount=None,
                refund_total=None,
                net_amount=None,
            )
        )

    snapshots.sort(
        key=lambda snapshot: (
            snapshot.original_transaction_id is None,
            snapshot.original_transaction_id or snapshot.refund_transaction_ids[0],
        )
    )
    return snapshots


def candidate_score(
    *,
    purchase: Transaction,
    refund: Transaction,
    day_gap: int,
) -> int:
    description_similarity = _description_similarity(
        purchase.description,
        refund.description,
    )
    amount_gap = abs(abs(purchase.amount) - refund.amount)
    return (description_similarity * 1000) - (day_gap * 10) - amount_gap


def _description_similarity(left: str, right: str) -> int:
    left_tokens = _tokenize(left)
    right_tokens = _tokenize(right)
    if not left_tokens or not right_tokens:
        return 0
    shared_count = len(left_tokens & right_tokens)
    union_count = len(left_tokens | right_tokens)
    if union_count == 0:
        return 0
    return int((shared_count / union_count) * 100)


def _tokenize(text: str) -> set[str]:
    return {token for token in TOKEN_PATTERN.split(text.casefold()) if len(token) >= 2}


def normalized_party(merchant: str, description: str) -> str:
    return (merchant or description).strip().casefold()


def normalized_optional_text(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip().casefold()
    if not normalized:
        return None
    return normalized


def normalized_currency(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip().upper()
    if not normalized:
        return None
    return normalized
