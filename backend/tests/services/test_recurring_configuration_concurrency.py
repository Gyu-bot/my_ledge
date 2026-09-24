"""PostgreSQL regression in a private schema of an explicitly supplied test DB.

Set MY_LEDGE_CONCURRENCY_DATABASE_URL to a disposable audit_* or test_* database.
No production schema is queried or modified; the fixture drops only its UUID schema.
"""

import asyncio
from datetime import date, time
import os
from uuid import uuid4

from fastapi import HTTPException
import pytest
from sqlalchemy import func, select, text
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.models import Base
from app.models.app_setting import AppSetting
from app.models.auto_classification import (
    AutoClassificationSettings,
    RecurringCategoryRule,
)
from app.models.transaction import Transaction
from app.schemas.auto_classification import (
    AutoClassificationSettingsPatchRequest,
    RecurringCategoryRuleRequest,
    RecurringDryRunApplyRequest,
)
from app.services.auto_classification_service import (
    apply_recurring_dry_run,
    delete_recurring_category_rule,
    dry_run_recurring_category_rules,
    upsert_recurring_category_rule,
    patch_auto_classification_settings,
)
from app.services.settings_service import patch_analytics_settings


@pytest.fixture
async def postgres_sessions():
    database_url = os.environ.get("MY_LEDGE_CONCURRENCY_DATABASE_URL")
    if database_url is None:
        pytest.skip("An explicitly selected disposable PostgreSQL database is required")
    parsed = make_url(database_url)
    if parsed.get_backend_name() != "postgresql" or not (
        parsed.database or ""
    ).startswith(("audit_", "test_")):
        pytest.fail(
            "Concurrency tests require an audit_* or test_* PostgreSQL database"
        )
    schema = f"recurring_test_{uuid4().hex}"
    admin_engine = create_async_engine(database_url)
    engine = create_async_engine(
        database_url,
        connect_args={
            "server_settings": {"search_path": schema, "statement_timeout": "10000"}
        },
    )
    try:
        async with admin_engine.begin() as connection:
            await connection.execute(text(f'CREATE SCHEMA "{schema}"'))
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
        yield async_sessionmaker(engine, expire_on_commit=False)
    finally:
        await engine.dispose()
        async with admin_engine.begin() as connection:
            await connection.execute(text(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE'))
        await admin_engine.dispose()


async def seed(factory, *, reverse_dates=False):
    async with factory() as session:
        rows = [
            Transaction(
                date=date(2026, month, 5),
                time=time(9),
                type="지출",
                category_major="구독",
                category_minor="서비스",
                description="예시서비스",
                merchant="예시서비스",
                amount=-10000,
                source="manual",
            )
            for month in ((2, 1) if reverse_dates else (1, 2))
        ]
        rule = RecurringCategoryRule(
            category_major="구독", recurring_payment_kind="monthly_recurring"
        )
        session.add_all(
            [
                *rows,
                rule,
                AutoClassificationSettings(id=1, apply_recurring_rules_on_upload=False),
                AppSetting(
                    scope="analytics.recurring_dry_run",
                    key="min_occurrences",
                    value="2",
                ),
                AppSetting(
                    scope="analytics.recurring_dry_run",
                    key="default_apply_scope",
                    value="all_matching",
                ),
            ]
        )
        await session.commit()
        item = (await dry_run_recurring_category_rules(session)).items[0]
        request = RecurringDryRunApplyRequest(
            merchant=item.merchant,
            proposed_kind=item.proposed_kind,
            preview_token=item.preview_token,
            apply_scope="all_matching",
        )
        return [row.id for row in rows], rule.id, request


async def wait_for_blocker(observer, waiting_pid, blocking_pid):
    async def poll():
        while blocking_pid not in await observer.scalar(
            select(func.pg_blocking_pids(waiting_pid))
        ):
            await asyncio.sleep(0.01)

    await asyncio.wait_for(poll(), timeout=5)


async def update_configuration(session, change, rule_id):
    if change in {"min_occurrences", "default_apply_scope"}:
        await patch_analytics_settings(
            session,
            spending_anomalies={},
            recurring_dry_run={
                change: 3 if change == "min_occurrences" else "reviewed_only"
            },
        )
    elif change == "legacy_upload":
        await patch_auto_classification_settings(
            session,
            AutoClassificationSettingsPatchRequest(
                apply_recurring_rules_on_upload=True
            ),
        )
    elif change == "rule_kind":
        await upsert_recurring_category_rule(
            session,
            RecurringCategoryRuleRequest(
                category_major="구독", recurring_payment_kind="installment"
            ),
        )
    else:
        assert await delete_recurring_category_rule(session, rule_id)


async def try_approval(session, request):
    try:
        return (await apply_recurring_dry_run(session, request)).updated
    except HTTPException as exc:
        await session.rollback()
        return exc.status_code


@pytest.mark.parametrize(
    "change",
    [
        "min_occurrences",
        "default_apply_scope",
        "rule_kind",
        "rule_delete",
        "legacy_upload",
    ],
)
@pytest.mark.parametrize("first", ["approval", "configuration"])
async def test_configuration_and_approval_have_a_database_serialization_point(
    postgres_sessions, change, first
):
    factory = postgres_sessions
    row_ids, rule_id, request = await seed(factory)
    async with (
        factory() as blocker,
        factory() as approval,
        factory() as writer,
        factory() as observer,
    ):
        # Cache config in the approval session first: after waiting it must read
        # current DB values rather than stale identity-map objects.
        cached_settings = (await approval.scalars(select(AppSetting))).all()
        cached_rules = (await approval.scalars(select(RecurringCategoryRule))).all()
        assert cached_settings and cached_rules
        blocker_pid = await blocker.scalar(select(func.pg_backend_pid()))
        approval_pid = await approval.scalar(select(func.pg_backend_pid()))
        writer_pid = await writer.scalar(select(func.pg_backend_pid()))
        tasks = []
        try:
            if first == "approval":
                await blocker.execute(
                    select(Transaction)
                    .where(Transaction.id.in_(row_ids))
                    .with_for_update()
                )
                approval_task = asyncio.create_task(try_approval(approval, request))
                tasks.append(approval_task)
                await wait_for_blocker(observer, approval_pid, blocker_pid)
                writer_task = asyncio.create_task(
                    update_configuration(writer, change, rule_id)
                )
                tasks.append(writer_task)
                # While approval waits on a row, config must wait on approval's
                # advisory lock, not commit a change behind its already-read token.
                await wait_for_blocker(observer, writer_pid, approval_pid)
            else:
                if change in {"min_occurrences", "default_apply_scope"}:
                    await blocker.execute(
                        select(AppSetting)
                        .where(
                            AppSetting.scope == "analytics.recurring_dry_run",
                            AppSetting.key == change,
                        )
                        .with_for_update()
                    )
                elif change == "legacy_upload":
                    await blocker.execute(
                        select(AutoClassificationSettings).with_for_update()
                    )
                else:
                    await blocker.execute(
                        select(RecurringCategoryRule)
                        .where(RecurringCategoryRule.id == rule_id)
                        .with_for_update()
                    )
                writer_task = asyncio.create_task(
                    update_configuration(writer, change, rule_id)
                )
                tasks.append(writer_task)
                await wait_for_blocker(observer, writer_pid, blocker_pid)
                approval_task = asyncio.create_task(try_approval(approval, request))
                tasks.append(approval_task)
                await wait_for_blocker(observer, approval_pid, writer_pid)
            await blocker.commit()
            approval_result = await asyncio.wait_for(approval_task, timeout=5)
            await asyncio.wait_for(writer_task, timeout=5)
            assert approval_result == (2 if first == "approval" else 409)
            kinds = list(
                (
                    await observer.scalars(
                        select(Transaction.recurring_payment_kind).where(
                            Transaction.id.in_(row_ids)
                        )
                    )
                ).all()
            )
            assert kinds == (
                ["monthly_recurring"] * 2 if first == "approval" else [None, None]
            )
        finally:
            await blocker.rollback()
            for task in tasks:
                if not task.done():
                    task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)
            await approval.rollback()
            await writer.rollback()


@pytest.mark.parametrize("operation", ["update", "delete"])
async def test_recurring_approval_locks_in_bulk_primary_key_order(
    postgres_sessions,
    operation,
):
    from app.schemas.transaction import (
        TransactionBulkMutationRequest,
        TransactionBulkUpdateRequest,
    )
    from app.services.transactions_service import (
        bulk_delete_transactions,
        bulk_update_transactions,
    )

    factory = postgres_sessions
    # ID 1 is later than ID 2: date ordering would oppose ORM flush PK ordering.
    row_ids, _rule_id, request = await seed(factory, reverse_dates=True)
    async with factory() as writer, factory() as approval, factory() as observer:
        preview = (await dry_run_recurring_category_rules(observer)).items[0]
        assert [row.id for row in preview.matched_transactions] == list(
            reversed(row_ids)
        )
        writer_pid = await writer.scalar(select(func.pg_backend_pid()))
        approval_pid = await approval.scalar(select(func.pg_backend_pid()))
        await writer.execute(
            select(Transaction).where(Transaction.id == row_ids[0]).with_for_update()
        )
        approval_task = asyncio.create_task(try_approval(approval, request))
        tasks = [approval_task]
        try:
            await wait_for_blocker(observer, approval_pid, writer_pid)
            if operation == "update":
                writer_task = asyncio.create_task(
                    bulk_update_transactions(
                        writer,
                        TransactionBulkUpdateRequest(ids=row_ids, memo="동시 수정"),
                    )
                )
            else:
                writer_task = asyncio.create_task(
                    bulk_delete_transactions(
                        writer, TransactionBulkMutationRequest(ids=row_ids)
                    )
                )
            tasks.append(writer_task)
            approved, updated = await asyncio.wait_for(
                asyncio.gather(approval_task, writer_task), timeout=5
            )
            assert updated.updated == 2
            assert approved == (2 if operation == "update" else 409)
            rows = (
                await observer.scalars(select(Transaction).order_by(Transaction.id))
            ).all()
            if operation == "update":
                assert all(
                    row.memo == "동시 수정"
                    and row.recurring_payment_kind == "monthly_recurring"
                    for row in rows
                )
            else:
                assert all(
                    row.is_deleted and row.recurring_payment_kind is None
                    for row in rows
                )
        finally:
            for task in tasks:
                if not task.done():
                    task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)
            await approval.rollback()
            await writer.rollback()
