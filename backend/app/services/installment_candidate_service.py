"""Discover recurring observations for human review, never infer total count."""

from collections import Counter, defaultdict
from datetime import timedelta
from hashlib import sha256
import json

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.installment_candidate_review import InstallmentCandidateReview
from app.models.installment_plan import InstallmentPlan
from app.models.installment_transaction_link import InstallmentTransactionLink
from app.models.loan_transaction_link import LoanTransactionLink
from app.models.transaction import Transaction
from app.schemas.installment import (
    InstallmentPlanCandidate,
    InstallmentPlanCandidateListResponse,
    InstallmentCandidateCreateRequest,
    InstallmentCandidateReviewRequest,
    InstallmentCandidateReviewResponse,
    InstallmentPlanResponse,
)
from app.services.metric_views import TRANSACTION_NATURE_VIEW
from app.services.installment_plan_match import (
    match_installment_plan,
    nearest_installment_number,
    normalized_plan_merchant,
)
from app.services.installment_service import _add_months, _load_plan_or_500


# This is a discovery filter, not asset liquidity classification. Unknown
# non-empty names remain review candidates; only known non-card forms are out.
_NON_CARD_PAYMENT_MARKERS = (
    "통장",
    "예금",
    "저축",
    "적금",
    "계좌",
    "입출금",
    "cma",
    "파킹",
    "간편결제",
    "선불",
    "페이",
    "pay",
    "머니",
    "money",
    "포인트",
    "point",
    "현금",
    "cash",
)


def _is_card_candidate(payment_method: str | None) -> bool:
    normalized = (payment_method or "").strip().casefold()
    return bool(normalized) and not any(
        marker in normalized for marker in _NON_CARD_PAYMENT_MARKERS
    )


def _key(payment_method: str, identity: str, amount: int) -> str:
    # No transaction IDs or date-window boundary: append/backfill/re-upload keeps
    # a dismissal. Repeated identical series stay dismissed until explicit restore.
    return sha256(
        json.dumps([payment_method, identity, amount], ensure_ascii=False).encode()
    ).hexdigest()


def discover_series(
    transactions: list[Transaction], window_start
) -> list[InstallmentPlanCandidate]:
    groups = defaultdict(list)
    for row in transactions:
        if not _is_card_candidate(row.payment_method):
            continue
        for kind, value in (
            ("merchant", row.merchant),
            ("description", row.description),
        ):
            identity = normalized_plan_merchant(value)
            if identity:
                groups[(row.payment_method, kind + ":" + identity)].append(row)
    found = []
    identity_priorities = {}
    for (payment_method, identity), rows in groups.items():
        rows.sort(key=lambda row: (row.date, row.id))
        amounts = {
            amount
            for amount, count in Counter(abs(row.amount) for row in rows).items()
            if count >= 2
        }
        for amount in amounts:
            eligible = [
                row
                for row in rows
                if abs(abs(row.amount) - amount) <= min(1000, max(100, amount // 100))
            ]
            for index, first in enumerate(eligible):
                best = None
                for shift in range(-3, 4):
                    anchor = first.date + timedelta(days=shift)
                    if sum(abs((row.date - anchor).days) <= 3 for row in eligible) != 1:
                        continue
                    chain = [first]
                    cost = abs(shift)
                    for number in range(2, 121):
                        due = _add_months(anchor, number - 1)
                        possible = [
                            row
                            for row in eligible[index + 1 :]
                            if row.date > chain[-1].date
                            and abs(row.amount) == amount
                            and abs((row.date - due).days) <= 3
                        ]
                        # Two payments in one slot are ambiguous; don't pick arbitrarily.
                        if len(possible) != 1:
                            break
                        chain.append(possible[0])
                        cost += abs((possible[0].date - due).days)
                    if len(chain) >= 3 and (
                        best is None or (-len(chain), cost, abs(shift)) < best[0]
                    ):
                        best = ((-len(chain), cost, abs(shift)), anchor, chain)
                if best is None:
                    continue
                _, anchor, chain = best
                identity_priorities[_key(payment_method, identity, amount)] = (
                    0 if identity.startswith("merchant:") else 1
                )
                found.append(
                    InstallmentPlanCandidate(
                        series_key=_key(payment_method, identity, amount),
                        observed_count=len(chain),
                        first_observed_date=chain[0].date,
                        last_observed_date=chain[-1].date,
                        first_payment_date=anchor,
                        payment_method=payment_method,
                        merchant=chain[0].merchant or chain[0].description,
                        monthly_amount=amount,
                        transaction_ids=[row.id for row in chain],
                        starts_at_data_window_edge=window_start is not None
                        and chain[0].date <= window_start + timedelta(days=31),
                    )
                )
    # Longest chain wins; merchant identity before description for stable keys.
    found.sort(
        key=lambda item: (
            -item.observed_count,
            item.first_observed_date,
            identity_priorities[item.series_key],
            item.series_key,
        )
    )
    selected = []
    used: set[int] = set()
    used_keys: set[str] = set()
    # Remember every alias key covering a selected chain, including the same
    # identity recurring after a gap; otherwise an alias could re-expose it.
    alias_keys = {}
    for item in found:
        alias_keys.setdefault(frozenset(item.transaction_ids), set()).add(
            item.series_key
        )
    for item in found:
        if item.series_key in used_keys or used.intersection(item.transaction_ids):
            continue
        selected.append(item)
        used_keys.update(alias_keys[frozenset(item.transaction_ids)])
        used.update(item.transaction_ids)
    return selected


async def list_installment_plan_candidates(
    db_session: AsyncSession, *, include_dismissed: bool = False
) -> InstallmentPlanCandidateListResponse:
    canonical = TRANSACTION_NATURE_VIEW
    rows = list(
        (
            await db_session.scalars(
                select(Transaction)
                .join(canonical, canonical.c.transaction_id == Transaction.id)
                .where(
                    Transaction.type == "지출",
                    Transaction.amount < 0,
                    Transaction.currency == "KRW",
                    Transaction.is_deleted.is_(False),
                    Transaction.merged_into_id.is_(None),
                    canonical.c.recurring_commitment_id.is_(None),
                    ~select(LoanTransactionLink.id)
                    .where(LoanTransactionLink.transaction_id == Transaction.id)
                    .exists(),
                    ~select(InstallmentTransactionLink.id)
                    .where(InstallmentTransactionLink.transaction_id == Transaction.id)
                    .exists(),
                )
                .order_by(Transaction.date, Transaction.id)
            )
        ).all()
    )
    # Already registered schedules belong in the existing plan's link worklist.
    plans = list(
        (
            await db_session.scalars(
                select(InstallmentPlan).where(InstallmentPlan.status == "active")
            )
        ).all()
    )
    rows = [
        row
        for row in rows
        if not any(
            match_installment_plan(
                plan=plan,
                transaction_date=row.date,
                amount=row.amount,
                merchant=row.merchant,
                payment_method=row.payment_method,
            )
            is not None
            for plan in plans
        )
    ]
    window_start = await db_session.scalar(
        select(func.min(Transaction.date)).where(
            Transaction.is_deleted.is_(False), Transaction.merged_into_id.is_(None)
        )
    )
    reviews = {
        row.series_key: row.review_status
        for row in (await db_session.scalars(select(InstallmentCandidateReview))).all()
    }
    candidates = discover_series(rows, window_start)
    # Suppress all alternate merchant/description identities of dismissed rows.
    dismissed_ids = set()
    for candidate in candidates:
        if reviews.get(candidate.series_key) == "not_installment":
            dismissed_ids.update(candidate.transaction_ids)
    result = []
    for candidate in candidates:
        candidate.review_status = reviews.get(candidate.series_key, "pending")
        if include_dismissed or not dismissed_ids.intersection(
            candidate.transaction_ids
        ):
            result.append(candidate)
    return InstallmentPlanCandidateListResponse(items=result)


async def review_installment_candidate(
    db_session: AsyncSession,
    series_key: str,
    payload: InstallmentCandidateReviewRequest,
) -> InstallmentCandidateReviewResponse:
    review = await db_session.get(InstallmentCandidateReview, series_key)
    if review is None:
        candidates = await list_installment_plan_candidates(
            db_session, include_dismissed=True
        )
        if not any(item.series_key == series_key for item in candidates.items):
            raise HTTPException(status_code=404, detail="할부 후보를 찾을 수 없습니다.")
        review = InstallmentCandidateReview(
            series_key=series_key, review_status=payload.review_status
        )
        db_session.add(review)
    review.review_status = payload.review_status
    await db_session.commit()
    return InstallmentCandidateReviewResponse(
        series_key=series_key, review_status=payload.review_status
    )


async def create_plan_from_candidate(
    db_session: AsyncSession,
    series_key: str,
    payload: InstallmentCandidateCreateRequest,
) -> InstallmentPlanResponse:
    # All creation paths take these transaction locks before reading occupancy.
    await db_session.execute(
        select(Transaction)
        .where(Transaction.id.in_(payload.transaction_ids))
        .order_by(Transaction.id)
        .with_for_update()
    )
    candidates = await list_installment_plan_candidates(db_session)
    candidate = next(
        (item for item in candidates.items if item.series_key == series_key), None
    )
    if candidate is None or sorted(candidate.transaction_ids) != sorted(
        payload.transaction_ids
    ):
        raise HTTPException(
            status_code=409,
            detail="후보가 변경되었습니다. 새로고침 후 다시 확인하세요.",
        )
    if not payload.display_name.strip():
        raise HTTPException(status_code=422, detail="계획명을 입력하세요.")
    transactions = list(
        (
            await db_session.scalars(
                select(Transaction)
                .where(Transaction.id.in_(candidate.transaction_ids))
                .order_by(Transaction.date, Transaction.id)
            )
        ).all()
    )
    numbers = []
    for row in transactions:
        number = nearest_installment_number(
            first_payment_date=payload.first_payment_date,
            transaction_date=row.date,
            total_installments=payload.total_installments,
        )
        if (
            abs((row.date - _add_months(payload.first_payment_date, number - 1)).days)
            > 3
        ):
            raise HTTPException(
                status_code=422,
                detail="첫 납부일과 총 횟수가 관측 거래를 포함해야 합니다.",
            )
        numbers.append(number)
    if len(set(numbers)) != len(numbers):
        raise HTTPException(status_code=409, detail="관측 거래의 회차가 중복됩니다.")
    plan = InstallmentPlan(
        display_name=payload.display_name.strip(),
        merchant=candidate.merchant,
        payment_method=candidate.payment_method,
        monthly_amount=candidate.monthly_amount,
        first_payment_date=payload.first_payment_date,
        total_installments=payload.total_installments,
        status="active",
    )
    db_session.add(plan)
    try:
        await db_session.flush()
        for row, number in zip(transactions, numbers, strict=True):
            db_session.add(
                InstallmentTransactionLink(
                    transaction_id=row.id,
                    installment_plan_id=plan.id,
                    installment_number=number,
                    source="manual",
                )
            )
        await db_session.commit()
    except IntegrityError as exc:
        await db_session.rollback()
        raise HTTPException(
            status_code=409, detail="연결이 변경되었습니다. 새로고침하세요."
        ) from exc
    return await _load_plan_or_500(db_session, plan.id)
