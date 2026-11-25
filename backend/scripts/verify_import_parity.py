from __future__ import annotations

import argparse
import asyncio
import json
import sys
from dataclasses import asdict
from datetime import date
from pathlib import Path

from openpyxl import load_workbook
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import get_settings
from app.parsers.decrypt import open_excel_bytes
from app.services.source_verification import verify_open_workbook_parity
from app.services.upload_service import import_transactions_from_open_workbook


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
    payload: dict[str, object] = {
        "workbook": str(workbook_path),
        "snapshot_date": snapshot_date.isoformat(),
        "import_result": None,
        "report": None,
    }
    stage = "open_workbook"
    try:
        settings = get_settings()
        with open_excel_bytes(
            workbook_path.read_bytes(), settings.excel_password
        ) as buffer:
            workbook = load_workbook(buffer, data_only=True)
        try:
            stage = "import"
            engine = create_async_engine(settings.database_url, pool_pre_ping=True)
            factory = async_sessionmaker(
                bind=engine, class_=AsyncSession, expire_on_commit=False
            )
            try:
                async with factory() as session:
                    result = await import_transactions_from_open_workbook(
                        session, workbook, workbook_path.name, snapshot_date
                    )
                    payload.update(status=result.status, import_result=asdict(result))
                    if result.status != "success":
                        return payload
                    stage = "verify"
                    report = await verify_open_workbook_parity(
                        session, workbook, snapshot_date, sample_size, sample_seed
                    )
                payload.update(
                    status="mismatch" if report.has_mismatches else "success",
                    report=asdict(report),
                )
            finally:
                await engine.dispose()
        finally:
            workbook.close()
    except Exception as exc:
        payload.update(status="failed", failed_stage=stage, error_message=str(exc))
    return payload


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Import a workbook and verify transaction/sample + snapshot parity.",
    )
    parser.add_argument("--snapshot-date", type=date.fromisoformat, required=True)
    parser.add_argument("--workbook", default=None)
    parser.add_argument("--sample-size", type=int, default=12)
    parser.add_argument("--sample-seed", type=int, default=20260324)
    args = parser.parse_args()
    if args.sample_size < 0:
        parser.error("--sample-size must be non-negative")

    try:
        workbook_path = _sample_workbook_path(args.workbook)
    except FileNotFoundError as exc:
        parser.error(str(exc))
    payload = asyncio.run(
        _run(args.snapshot_date, workbook_path, args.sample_size, args.sample_seed)
    )
    print(json.dumps(payload, ensure_ascii=False, indent=2, default=str))
    return 0 if payload["status"] == "success" else 1


if __name__ == "__main__":
    sys.exit(main())
