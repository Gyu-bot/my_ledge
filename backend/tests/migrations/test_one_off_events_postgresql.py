"""T067 PostgreSQL migration, concurrent membership and re-import rollback."""

import asyncio
from datetime import date, time

import pytest
from fastapi import HTTPException
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

import test_net_worth_migration_postgresql as helpers
from app.models.one_off_event import OneOffEventMember
from app.models.settlement_group import SettlementMatch
from app.models.transaction import Transaction
from app.schemas.one_off_event import OneOffEventCreate, OneOffEventPatch
from app.schemas.upload import UploadApplyRequest, UploadApplySelection
from app.services import one_off_event_service as events
from app.services import upload_rollback_service as rollback
from app.services.upload_apply_service import apply_transaction_upload_from_rows
from app.services.upload_preview_service import preview_transaction_upload_from_rows

scratch_url = helpers.scratch_url

BEFORE = "20261117_0045"
AFTER = "20261125_0046"


def transaction(amount: int, name: str = "합성") -> Transaction:
    return Transaction(
        date=date(2031, 1, 10),
        time=time(12),
        type="지출",
        merchant=name,
        description=name,
        category_major="합성",
        amount=amount,
        currency="KRW",
        payment_method="synthetic",
    )


def test_roundtrip_restores_0045(scratch_url):
    helpers._alembic(scratch_url, "upgrade", BEFORE)
    old_views, old_tables = helpers._catalog(scratch_url)

    async def columns():
        engine = create_async_engine(scratch_url)
        try:
            async with engine.connect() as connection:
                rows = await connection.execute(
                    text(
                        """SELECT table_name, array_agg(column_name ORDER BY ordinal_position)
                           FROM information_schema.columns
                           WHERE table_schema = 'public' AND
                             table_name IN ('vw_metric_flow_lines', 'vw_monthly_flow_summary')
                           GROUP BY table_name"""
                    )
                )
                return dict(rows.all())
        finally:
            await engine.dispose()

    old = asyncio.run(columns())
    helpers._alembic(scratch_url, "upgrade", AFTER)
    new_views, new_tables = helpers._catalog(scratch_url)
    new = asyncio.run(columns())
    assert new["vw_metric_flow_lines"] == old["vw_metric_flow_lines"] + [
        "one_off_event_id"
    ]
    assert new["vw_monthly_flow_summary"] == old["vw_monthly_flow_summary"] + [
        "one_off_total",
        "ongoing_outflow",
        "ongoing_living_spend",
    ]
    assert new_tables - old_tables == {"one_off_events", "one_off_event_members"}
    assert new_views.keys() == old_views.keys()
    assert {name for name in old_views if old_views[name] != new_views[name]} == {
        "vw_metric_flow_lines",
        "vw_monthly_flow_summary",
    }
    assert "prefix" in old_views["vw_transaction_nature"]
    helpers._alembic(scratch_url, "downgrade", BEFORE)
    assert helpers._catalog(scratch_url) == (old_views, old_tables)
    helpers._alembic(scratch_url, "upgrade", AFTER)
    assert helpers._catalog(scratch_url) == (new_views, new_tables)


def test_concurrent_add_conflict_is_atomic(scratch_url):
    helpers._alembic(scratch_url, "upgrade", AFTER)

    async def exercise():
        engine = create_async_engine(scratch_url)
        factory = async_sessionmaker(engine, expire_on_commit=False)
        try:
            async with factory() as db:
                shared, extra_a, extra_b = [
                    transaction(-value) for value in (10, 20, 30)
                ]
                db.add_all([shared, extra_a, extra_b])
                await db.commit()
                a = await events.create_event(db, OneOffEventCreate(name="A"))
                b = await events.create_event(db, OneOffEventCreate(name="B"))

            async def add(event_id, extra_id):
                async with factory() as db:
                    return await events.add_members(db, event_id, [extra_id, shared.id])

            outcomes = await asyncio.gather(
                add(a.id, extra_a.id), add(b.id, extra_b.id), return_exceptions=True
            )
            (error,) = [
                result for result in outcomes if isinstance(result, HTTPException)
            ]
            assert error.status_code == 409
            assert error.detail == [
                {"transaction_id": shared.id, "reason": "in_other_event"}
            ]
            (winner,) = [
                result for result in outcomes if not isinstance(result, Exception)
            ]
            async with factory() as db:
                members = (await db.scalars(select(OneOffEventMember))).all()
                assert {m.event_id for m in members} == {winner.id}
                assert len(members) == 2
        finally:
            await engine.dispose()

    asyncio.run(exercise())


@pytest.mark.parametrize("replace_purchase", [True, False], ids=["purchase", "refund"])
def test_replacement_moves_direct_membership_and_rollback_restores_it(
    scratch_url, replace_purchase
):
    helpers._alembic(scratch_url, "upgrade", AFTER)

    async def exercise():
        engine = create_async_engine(scratch_url)
        factory = async_sessionmaker(engine, expire_on_commit=False)
        try:
            async with factory() as db:
                purchase, refund = transaction(-200, "원구매"), transaction(100, "환불")
                refund.date = date(2031, 2, 2)
                db.add_all([purchase, refund])
                await db.flush()
                db.add(
                    SettlementMatch(
                        original_transaction_id=purchase.id,
                        settlement_transaction_id=refund.id,
                        status="user_confirmed",
                        matched_amount=60,
                    )
                )
                await db.commit()
                a = await events.create_event(
                    db, OneOffEventCreate(name="A", transaction_ids=[purchase.id])
                )
                b = await events.create_event(
                    db, OneOffEventCreate(name="B", transaction_ids=[refund.id])
                )
                old, event_id = (purchase, a.id) if replace_purchase else (refund, b.id)
                incoming = [
                    {
                        "date": old.date,
                        "time": time(15),
                        "type": old.type,
                        "category_major": old.category_major,
                        "category_minor": None,
                        "description": "교체",
                        "merchant": "교체",
                        "amount": old.amount,
                        "currency": old.currency,
                        "payment_method": old.payment_method,
                        "memo": None,
                    }
                ]
                preview = await preview_transaction_upload_from_rows(db, incoming)
                (change,) = preview.review_required_changes
                assert change.change_type == "possible_replacement"
                result = await apply_transaction_upload_from_rows(
                    db_session=db,
                    parsed_rows=incoming,
                    filename="synthetic.xlsx",
                    snapshot_date=old.date,
                    apply_request=UploadApplyRequest(
                        confirmation=True,
                        selections=[
                            UploadApplySelection(
                                change_type=change.change_type,
                                source_row_hash=change.source_row_hash or "",
                                existing_transaction_id=old.id,
                            )
                        ],
                    ),
                )
            async with factory() as db:
                assert await db.get(OneOffEventMember, old.id) is None
                changed = await events.get_event(db, event_id)
                assert changed.members[0].transaction_id != old.id
                # The confirmed allocation survives replacement of either posting.
                assert (await events.get_event(db, a.id)).counted_total == 140
                assert (await events.get_event(db, b.id)).counted_total == -40
                if not replace_purchase:
                    await events.update_event(db, a.id, OneOffEventPatch(name="편집"))
                    with pytest.raises(rollback.RollbackError) as error:
                        await rollback.rollback_upload(
                            db, result.upload_id, accept_changes=False
                        )
                    assert error.value.code == "ledger_changed"
                    assert "one_off_events" in error.value.changed_tables
                restored = await rollback.rollback_upload(
                    db, result.upload_id, accept_changes=not replace_purchase
                )
                assert restored["restored_counts"]["one_off_event_members"] == 2
            async with factory() as db:
                assert (await db.get(OneOffEventMember, old.id)).event_id == event_id
                assert (await events.get_event(db, a.id)).counted_total == 140
                assert (await events.get_event(db, b.id)).counted_total == -40
        finally:
            await engine.dispose()

    asyncio.run(exercise())


def test_pre_migration_restore_point_is_schema_changed(scratch_url):
    helpers._alembic(scratch_url, "upgrade", BEFORE)

    async def exercise(after):
        engine = create_async_engine(scratch_url)
        factory = async_sessionmaker(engine)
        try:
            async with factory() as db:
                if not after:
                    await db.execute(
                        text(
                            "INSERT INTO upload_logs (id, status) VALUES (1, 'success')"
                        )
                    )
                    await db.execute(
                        text(
                            "INSERT INTO upload_rollback_points (upload_log_id, status, snapshot) VALUES (1, 'ready', '{}'::jsonb)"
                        )
                    )
                    await db.commit()
                    return
                with pytest.raises(rollback.RollbackError) as error:
                    await rollback.rollback_upload(db, 1, accept_changes=True)
                assert error.value.code == "schema_changed"
                assert {"one_off_events", "one_off_event_members"} <= set(
                    error.value.changed_tables
                )
        finally:
            await engine.dispose()

    asyncio.run(exercise(False))
    helpers._alembic(scratch_url, "upgrade", AFTER)
    asyncio.run(exercise(True))
