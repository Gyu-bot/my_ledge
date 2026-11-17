"""Real PostgreSQL migration, atomic creation and concurrent human confirmation."""

import asyncio
from datetime import date, time

import pytest
from fastapi import HTTPException
from sqlalchemy import func, select, text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

import test_net_worth_migration_postgresql as helpers
from app.models import InstallmentPlan, InstallmentTransactionLink, Transaction
from app.schemas.installment import (
    InstallmentCandidateCreateRequest,
    InstallmentCandidateReviewRequest,
    InstallmentSuggestionAcceptRequest,
)
from app.services.installment_candidate_service import (
    create_plan_from_candidate,
    list_installment_plan_candidates,
    review_installment_candidate,
)
from app.services.installment_suggestion_service import accept_installment_suggestions

scratch_url = helpers.scratch_url


def test_candidates_migration_atomicity_and_concurrent_confirmation(scratch_url):
    helpers._alembic(scratch_url, "upgrade", "head")

    async def exercise():
        engine = create_async_engine(scratch_url)
        factory = async_sessionmaker(engine, expire_on_commit=False)
        try:
            async with factory() as db:
                rows = [
                    Transaction(
                        date=date(2031, month, 15),
                        time=time(9),
                        type="지출",
                        category_major="쇼핑",
                        merchant="합성기기",
                        description="합성원문",
                        payment_method="합성카드",
                        amount=-51007,
                        currency="KRW",
                    )
                    for month in (1, 2, 3)
                ]
                db.add_all(rows)
                await db.commit()
                candidate = (await list_installment_plan_candidates(db)).items[0]
                await review_installment_candidate(
                    db,
                    candidate.series_key,
                    InstallmentCandidateReviewRequest(review_status="not_installment"),
                )
                assert (await list_installment_plan_candidates(db)).items == []
                await review_installment_candidate(
                    db,
                    candidate.series_key,
                    InstallmentCandidateReviewRequest(review_status="pending"),
                )
                payload = InstallmentCandidateCreateRequest(
                    display_name="합성계획",
                    total_installments=6,
                    first_payment_date=date(2031, 1, 15),
                    transaction_ids=candidate.transaction_ids,
                )
                # PostgreSQL trigger simulates a late write failure after plan creation.
                await db.execute(
                    text(
                        "CREATE FUNCTION synthetic_link_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic failure'; END $$"
                    )
                )
                await db.execute(
                    text(
                        "CREATE TRIGGER synthetic_failure BEFORE INSERT ON installment_transaction_links FOR EACH ROW EXECUTE FUNCTION synthetic_link_failure()"
                    )
                )
                await db.commit()
                with pytest.raises(DBAPIError, match="synthetic failure"):
                    await create_plan_from_candidate(db, candidate.series_key, payload)
                await db.rollback()
                assert (
                    await db.scalar(select(func.count()).select_from(InstallmentPlan))
                    == 0
                )
                assert (
                    await db.scalar(
                        select(func.count()).select_from(InstallmentTransactionLink)
                    )
                    == 0
                )
                await db.execute(
                    text(
                        "DROP TRIGGER synthetic_failure ON installment_transaction_links"
                    )
                )
                await db.execute(text("DROP FUNCTION synthetic_link_failure()"))
                await db.commit()
                plan = await create_plan_from_candidate(
                    db, candidate.series_key, payload
                )
                assert plan.linked_installment_count == 3
                next_row = Transaction(
                    date=date(2031, 4, 15),
                    time=time(9),
                    type="지출",
                    category_major="쇼핑",
                    merchant="합성기기",
                    description="합성원문",
                    payment_method="합성카드",
                    amount=-51007,
                    currency="KRW",
                )
                db.add(next_row)
                await db.commit()
                confirmation = InstallmentSuggestionAcceptRequest(
                    items=[
                        {
                            "transaction_id": next_row.id,
                            "installment_plan_id": plan.id,
                            "installment_number": 4,
                        }
                    ]
                )

            async def confirm():
                async with factory() as db:
                    try:
                        await accept_installment_suggestions(db, confirmation)
                        return 200
                    except HTTPException as exc:
                        await db.rollback()
                        return exc.status_code

            assert sorted(await asyncio.gather(confirm(), confirm())) == [200, 409]
            async with factory() as db:
                assert (
                    await db.scalar(
                        select(func.count()).select_from(InstallmentTransactionLink)
                    )
                    == 4
                )
                assert (
                    await db.scalar(
                        select(func.count())
                        .select_from(InstallmentTransactionLink)
                        .where(InstallmentTransactionLink.source == "manual")
                    )
                    == 4
                )
        finally:
            await engine.dispose()

    asyncio.run(exercise())
    helpers._alembic(scratch_url, "downgrade", "20261117_0043")
    helpers._alembic(scratch_url, "upgrade", "head")
