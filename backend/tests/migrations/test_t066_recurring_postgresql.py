"""T066 0045 보존·공통 매칭·후반 실패 원자성 (합성 PostgreSQL)."""

import asyncio
from datetime import date, time

import pytest
from sqlalchemy import select, text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

import test_net_worth_migration_postgresql as helpers
from app.models.nature_axes import RecurringCommitment, TransactionNatureOverride
from app.models.transaction import Transaction
from app.schemas.nature_axes import (
    RecurringCommitmentBulkDeleteRequest,
    RecurringCommitmentMergeRequest,
)
from app.services.metric_views import TRANSACTION_NATURE_VIEW
from app.services.nature_axes_service import (
    bulk_delete_commitments,
    find_rule_commitment_id,
    merge_commitments,
)

scratch_url = helpers.scratch_url


def test_t066_migration_parity_and_atomicity(scratch_url):
    helpers._alembic(scratch_url, "upgrade", "20261117_0044")
    views_before, _ = helpers._catalog(scratch_url)

    async def before():
        engine = create_async_engine(scratch_url)
        async with engine.begin() as conn:
            await conn.execute(
                text(
                    "INSERT INTO recurring_commitments (match_scope,merchant,category_major,origin) VALUES ('merchant','Synthetic01','synthetic','migration')"
                )
            )
            await conn.execute(
                text(
                    "INSERT INTO transactions (date,time,type,merchant,description,category_major,amount) VALUES ('2031-01-10','12:00','지출','Synthetic01','synthetic','synthetic',-1234)"
                )
            )
            ids = (
                await conn.execute(
                    text(
                        "SELECT transaction_id, recurring_commitment_id FROM vw_transaction_nature ORDER BY transaction_id"
                    )
                )
            ).all()
        await engine.dispose()
        return ids

    expected = asyncio.run(before())
    helpers._alembic(scratch_url, "upgrade", "head")

    async def exercise():
        engine = create_async_engine(scratch_url)
        factory = async_sessionmaker(engine, expire_on_commit=False)
        try:
            async with factory() as db:
                assert (
                    await db.execute(
                        text(
                            "SELECT transaction_id, recurring_commitment_id FROM vw_transaction_nature ORDER BY transaction_id"
                        )
                    )
                ).all() == expected
                assert (
                    await db.scalar(select(RecurringCommitment.merchant_match))
                    == "exact"
                )
                exact = await db.get(RecurringCommitment, 1)
                short = RecurringCommitment(
                    match_scope="merchant",
                    merchant="synthetic",
                    merchant_match="prefix",
                    category_major="synthetic",
                    origin="user",
                )
                long = RecurringCommitment(
                    match_scope="merchant",
                    merchant="synthetic plan",
                    merchant_match="prefix",
                    category_major="synthetic",
                    origin="user",
                )
                db.add_all([short, long])
                await db.flush()
                rows = [
                    Transaction(
                        date=date(2031, 2, 10),
                        time=time(12),
                        type="지출",
                        merchant=merchant,
                        description="synthetic",
                        category_major="synthetic",
                        amount=-1234,
                    )
                    for merchant in (
                        "Synthetic01",
                        " SYNTHETIC\t Plan02 ",
                        "synthetic other",
                    )
                ]
                db.add_all(rows)
                await db.commit()
                for row, wanted in zip(
                    rows, [exact.id, long.id, short.id], strict=True
                ):
                    assert (
                        await find_rule_commitment_id(
                            db,
                            merchant=row.merchant,
                            category_major="synthetic",
                            category_minor=None,
                            on_date=row.date,
                        )
                        == wanted
                    )
                    assert (
                        await db.scalar(
                            select(
                                TRANSACTION_NATURE_VIEW.c.recurring_commitment_id
                            ).where(TRANSACTION_NATURE_VIEW.c.transaction_id == row.id)
                        )
                        == wanted
                    )
                db.add(
                    TransactionNatureOverride(
                        transaction_id=rows[1].id, commitment_id=long.id, source="user"
                    )
                )
                await db.execute(
                    text(
                        "CREATE FUNCTION t066_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic failure'; END $$"
                    )
                )
                await db.execute(
                    text(
                        "CREATE TRIGGER t066_fail BEFORE DELETE ON recurring_commitments FOR EACH ROW EXECUTE FUNCTION t066_fail()"
                    )
                )
                await db.commit()
                source_id, target_id, tx_id = long.id, short.id, rows[1].id
                with pytest.raises(DBAPIError):
                    await merge_commitments(
                        db,
                        RecurringCommitmentMergeRequest(
                            target_id=target_id,
                            source_ids=[source_id],
                            merchant_match="prefix",
                            merchant="changed prefix",
                        ),
                    )
                await db.rollback()
                assert (
                    await db.get(TransactionNatureOverride, tx_id)
                ).commitment_id == source_id
                assert (
                    await db.get(RecurringCommitment, target_id)
                ).merchant == "synthetic"
                with pytest.raises(DBAPIError):
                    await bulk_delete_commitments(
                        db,
                        RecurringCommitmentBulkDeleteRequest(
                            ids=[target_id, source_id]
                        ),
                    )
                await db.rollback()
                assert await db.get(RecurringCommitment, source_id) is not None
                assert (
                    await db.get(TransactionNatureOverride, tx_id)
                ).commitment_id == source_id
                await db.execute(
                    text("DROP TRIGGER t066_fail ON recurring_commitments")
                )
                await db.execute(text("DROP FUNCTION t066_fail()"))
                # downgrade 보존 비교를 위해 새 합성 설정/행은 제거한다.
                await db.execute(text("DELETE FROM transaction_nature_overrides"))
                await db.execute(text("DELETE FROM transactions WHERE id > 1"))
                await db.execute(text("DELETE FROM recurring_commitments WHERE id > 1"))
                await db.commit()
        finally:
            await engine.dispose()

    asyncio.run(exercise())
    helpers._alembic(scratch_url, "downgrade", "20261117_0044")
    assert helpers._catalog(scratch_url)[0] == views_before
    helpers._alembic(scratch_url, "upgrade", "head")
