"""T065 migration on a new disposable PostgreSQL database, synthetic settings only."""

import asyncio

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

import test_net_worth_migration_postgresql as migration_helpers

scratch_url = migration_helpers.scratch_url
_alembic = migration_helpers._alembic


def test_loan_rules_migration_flips_existing_setting_and_server_default(scratch_url):
    _alembic(scratch_url, "upgrade", "20261117_0042")

    async def execute(statement):
        engine = create_async_engine(scratch_url)
        try:
            async with engine.begin() as connection:
                result = await connection.execute(text(statement))
                return result.scalar() if result.returns_rows else None
        finally:
            await engine.dispose()

    asyncio.run(
        execute(
            "INSERT INTO auto_classification_settings (id, apply_loan_rules_on_upload) VALUES (1, FALSE)"
        )
    )
    _alembic(scratch_url, "upgrade", "head")
    assert (
        asyncio.run(
            execute(
                "SELECT apply_loan_rules_on_upload FROM auto_classification_settings WHERE id = 1"
            )
        )
        is True
    )
    assert (
        asyncio.run(
            execute(
                "SELECT column_default FROM information_schema.columns WHERE table_name = 'auto_classification_settings' AND column_name = 'apply_loan_rules_on_upload'"
            )
        )
        == "true"
    )
    assert (
        asyncio.run(
            execute(
                "INSERT INTO auto_classification_settings (id) VALUES (2) RETURNING apply_loan_rules_on_upload"
            )
        )
        is True
    )
    # 이후 사람이 끈 설정은 매 요청/재실행 시 자동으로 다시 켜지지 않는다.
    asyncio.run(
        execute(
            "UPDATE auto_classification_settings SET apply_loan_rules_on_upload = FALSE WHERE id = 1"
        )
    )
    _alembic(scratch_url, "upgrade", "head")
    assert (
        asyncio.run(
            execute(
                "SELECT apply_loan_rules_on_upload FROM auto_classification_settings WHERE id = 1"
            )
        )
        is False
    )
    _alembic(scratch_url, "downgrade", "20261117_0042")
    assert (
        asyncio.run(
            execute(
                "SELECT column_default FROM information_schema.columns WHERE table_name = 'auto_classification_settings' AND column_name = 'apply_loan_rules_on_upload'"
            )
        )
        == "false"
    )
    assert (
        asyncio.run(
            execute(
                "SELECT apply_loan_rules_on_upload FROM auto_classification_settings WHERE id = 1"
            )
        )
        is False
    )
