from datetime import date

import pytest
from pydantic import ValidationError
from sqlalchemy import func, select

from app.models.app_setting import AppSetting
from app.models.transaction import Transaction
from app.models.upload_log import UploadLog
from app.schemas.upload_review import ReviewContext, ReviewDecision, ReviewRevision
from app.services import upload_review_service as svc
from test_upload_review_service import (
    CONTEXT,
    apply,
    apply_request,
    prepare,
    row,
    tx,
    workbook,
)


@pytest.mark.parametrize(
    "field,value",
    [
        ("owner_profile", "ops"),
        ("account_hash", "A" * 64),
        ("archive_hash", "a" * 63),
        ("message_id", "ABC123"),
        ("message_id", "1abc "),
    ],
)
def test_literal_context_not_normalized(field, value):
    with pytest.raises(ValidationError):
        ReviewContext(**{**CONTEXT, field: value})


@pytest.mark.parametrize(
    "changes",
    [
        {"confirmation": False},
        {"confirmation": 1},
        {"snapshot_effect_ack": False},
        {"approval_reference": " "},
        {"approval_reference": " canonical "},
    ],
)
async def test_explicit_confirmation_schema(db_session, changes):
    p = await prepare(db_session)
    with pytest.raises(ValidationError):
        apply_request(p, **changes)


@pytest.mark.parametrize("first_action", ["keep", "add"])
async def test_unchanged_candidate_cannot_be_mutated_by_overlapping_entry(
    db_session, first_action
):
    existing = tx()
    db_session.add(existing)
    await db_session.commit()
    p = await prepare(db_session, workbook([row(), row(category_major="changed")]))
    assert [e.change_type.value for e in p.entries] == [
        "unchanged",
        "source_fields_changed",
    ]
    assert [d.action for d in p.decisions] == ["keep", "keep"]
    with pytest.raises(svc.ReviewError, match="protected"):
        await svc.revise_review(
            db_session,
            p.operation_id,
            ReviewRevision(
                plan_digest=p.plan_digest,
                decisions=[
                    ReviewDecision(entry_id="1", action=first_action, target_id=None),
                    ReviewDecision(
                        entry_id="2", action="update", target_id=existing.id
                    ),
                ],
            ),
        )


async def test_arbitrary_metadata_content_invalidates_same_count(db_session, tmp_path):
    setting = AppSetting(scope="synthetic", key="synthetic-key", value="initial")
    db_session.add(setting)
    await db_session.commit()
    data = workbook()
    p = await prepare(db_session, data)
    setting.value = "modified"
    await db_session.commit()
    with pytest.raises(svc.ReviewError, match="changed"):
        await apply(db_session, p, tmp_path, data)
    assert (await svc.get_review(db_session, p.operation_id)).status == "stale"
    assert await db_session.scalar(select(func.count()).select_from(UploadLog)) == 0
    assert await db_session.scalar(select(func.count()).select_from(Transaction)) == 0


async def test_additive_migration_runs_without_touching_finance_rows(db_session):
    import importlib.util
    from pathlib import Path
    from alembic.migration import MigrationContext
    from alembic.operations import Operations
    from app.models.upload_review_operation import UploadReviewOperation

    path = (
        Path(__file__).parents[2]
        / "alembic/versions/20261023_0033_upload_review_operations.py"
    )
    spec = importlib.util.spec_from_file_location("synthetic_review_migration", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    assert migration.down_revision == "20260924_0032"
    db_session.add(tx())
    await db_session.commit()
    conn = await db_session.connection()

    def migrate(connection):
        UploadReviewOperation.__table__.drop(connection)
        with Operations.context(MigrationContext.configure(connection)):
            migration.upgrade()
            assert (
                connection.scalar(
                    select(func.count()).select_from(UploadReviewOperation)
                )
                == 0
            )
            assert connection.scalar(select(func.count()).select_from(Transaction)) == 1
            migration.downgrade()
            migration.upgrade()

    await conn.run_sync(migrate)
    await db_session.commit()


@pytest.mark.parametrize("table", list(svc.SNAPSHOT_MODELS))
async def test_older_than_any_snapshot_is_refused(db_session, table):
    # This SQL-free gate check uses the actual five models and real persisted rows
    # copied from a fully populated synthetic workbook import.
    from app.parsers.snapshots import parse_snapshots
    from io import BytesIO
    from openpyxl import load_workbook
    from app.services.upload_service import replace_snapshots

    snapshots = parse_snapshots(
        load_workbook(BytesIO(workbook(full_snapshots=True)), data_only=True)
    )
    await replace_snapshots(db_session, date(2026, 10, 24), snapshots)
    for name, model in svc.SNAPSHOT_MODELS.items():
        if name != table:
            for item in (await db_session.scalars(select(model))).all():
                await db_session.delete(item)
    await db_session.commit()
    with pytest.raises(svc.ReviewError, match="older"):
        await prepare(db_session, workbook())
