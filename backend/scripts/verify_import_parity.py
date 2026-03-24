from __future__ import annotations

import argparse
import asyncio
import json
import sys
from dataclasses import asdict
from datetime import date
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import get_settings
from app.services.source_verification import verify_import_parity
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
    snapshot_date: date,
    workbook_path: Path,
    sample_size: int,
    sample_seed: int,
) -> dict[str, object]:
    settings = get_settings()
    engine = create_async_engine(settings.database_url, pool_pre_ping=True)
    session_factory = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)

    try:
        async with session_factory() as session:
            await import_transactions_from_workbook(
                db_session=session,
                file_bytes=workbook_path.read_bytes(),
                filename=workbook_path.name,
                snapshot_date=snapshot_date,
                excel_password=settings.excel_password,
            )
            report = await verify_import_parity(
                db_session=session,
                workbook_bytes=workbook_path.read_bytes(),
                snapshot_date=snapshot_date,
                transaction_sample_size=sample_size,
                transaction_sample_seed=sample_seed,
            )
            return {
                "workbook": str(workbook_path),
                "snapshot_date": snapshot_date.isoformat(),
                "report": asdict(report),
            }
    finally:
        await engine.dispose()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Import a workbook and verify transaction/sample + snapshot parity.",
    )
    parser.add_argument("--snapshot-date", type=date.fromisoformat, required=True)
    parser.add_argument("--workbook", default=None)
    parser.add_argument("--sample-size", type=int, default=12)
    parser.add_argument("--sample-seed", type=int, default=20260324)
    args = parser.parse_args()

    workbook_path = _sample_workbook_path(args.workbook)
    payload = asyncio.run(
        _run(args.snapshot_date, workbook_path, args.sample_size, args.sample_seed)
    )
    print(json.dumps(payload, ensure_ascii=False, indent=2, default=str))


if __name__ == "__main__":
    main()
