from __future__ import annotations

import argparse
import asyncio
import json
import sys
from datetime import date
from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import get_settings
from app.models.transaction import Transaction
from app.models.upload_log import UploadLog
from app.services.upload_service import import_transactions_from_workbook


def _sample_workbook_path(explicit_path: str | None) -> Path:
    if explicit_path:
        path = Path(explicit_path).expanduser().resolve()
        if not path.exists():
            raise FileNotFoundError(f"Workbook not found: {path}")
        return path

    repo_root = Path(__file__).resolve().parents[2]
    default_path = repo_root / "tmp" / "finance_sample.xlsx"
    if not default_path.exists():
        raise FileNotFoundError(f"Default workbook not found: {default_path}")
    return default_path


async def _run(
    snapshot_date: date, workbook_path: Path
) -> tuple[str, dict[str, object]]:
    settings = get_settings()
    engine = create_async_engine(settings.database_url, pool_pre_ping=True)
    session_factory = async_sessionmaker(
        bind=engine, class_=AsyncSession, expire_on_commit=False
    )

    try:
        async with session_factory() as session:
            result = await import_transactions_from_workbook(
                db_session=session,
                file_bytes=workbook_path.read_bytes(),
                filename=workbook_path.name,
                snapshot_date=snapshot_date,
                excel_password=settings.excel_password,
            )

            transaction_count = await session.scalar(
                select(func.count()).select_from(Transaction)
            )
            upload_log_count = await session.scalar(
                select(func.count()).select_from(UploadLog)
            )

            return result.status, {
                "result": {
                    "tx_total": result.tx_total,
                    "tx_new": result.tx_new,
                    "tx_skipped": result.tx_skipped,
                    "status": result.status,
                    "error_message": result.error_message,
                },
                "db": {
                    "transactions": transaction_count,
                    "upload_logs": upload_log_count,
                },
                "workbook": str(workbook_path),
            }
    finally:
        await engine.dispose()


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Run a PostgreSQL smoke import using the sample workbook.",
    )
    parser.add_argument("--snapshot-date", type=date.fromisoformat, required=True)
    parser.add_argument("--workbook", default=None)
    args = parser.parse_args()

    try:
        workbook_path = _sample_workbook_path(args.workbook)
    except FileNotFoundError as exc:
        parser.error(str(exc))
    status, payload = asyncio.run(_run(args.snapshot_date, workbook_path))
    print(json.dumps(payload, ensure_ascii=False, indent=2))
    return 0 if status == "success" else 1


if __name__ == "__main__":
    sys.exit(main())
