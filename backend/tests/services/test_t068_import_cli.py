import json
import os
import subprocess
import sys
from io import BytesIO
from pathlib import Path

import msoffcrypto
import pytest
from openpyxl import load_workbook
from sqlalchemy import select

from app.models.upload_log import UploadLog
from test_upload_review_service import DAY, row, workbook


def _run_cli(db_session, script, workbook_path, *args, password=""):
    root = Path(__file__).resolve().parents[2]
    return subprocess.run(
        [
            sys.executable,
            f"scripts/{script}.py",
            "--workbook",
            str(workbook_path),
            *args,
        ],
        cwd=root,
        env={
            **os.environ,
            "DATABASE_URL": str(db_session.bind.url),
            "EXCEL_PASSWORD": password,
        },
        check=False,
        capture_output=True,
        text=True,
        timeout=10,
    )


@pytest.mark.parametrize("expected", [80, 81])
async def test_verify_cli_reuses_encrypted_workbook_and_reports_parity(
    db_session, tmp_path, expected
):
    data = workbook([row("purchase"), row("refund", amount=20, seconds=1)])
    wb = load_workbook(BytesIO(data))
    snap = wb["뱅샐현황"]
    snap.insert_rows(1, 4)
    snap["B1"] = "2.현금흐름현황"
    snap["B2"], snap["E2"] = "항목", DAY.strftime("%Y-%m")
    snap["B3"] = "월수입 총계"
    snap["B4"], snap["E4"] = "기타", expected
    plaintext = BytesIO()
    wb.save(plaintext)
    plaintext.seek(0)
    path = tmp_path / "synthetic-encrypted.xlsx"
    password = "synthetic-workbook-password"
    with path.open("wb") as output:
        msoffcrypto.OfficeFile(plaintext).encrypt(password, output)

    result = _run_cli(
        db_session,
        "verify_import_parity",
        path,
        "--snapshot-date",
        str(DAY),
        password=password,
    )

    assert result.returncode == int(expected != 80), result.stderr
    report = json.loads(result.stdout)
    assert report["status"] == ("success" if expected == 80 else "mismatch")
    assert report["report"]["transaction"]["missing_sample_indices"] == []
    assert report["import_result"]["status"] == "success"
    assert (await db_session.scalar(select(UploadLog))).status == "success"


@pytest.mark.parametrize(
    "script", ["smoke_import_transactions", "verify_import_parity"]
)
async def test_import_cli_reports_partial_and_exits_nonzero(
    db_session, tmp_path, script
):
    wb = load_workbook(BytesIO(workbook()))
    del wb["뱅샐현황"]
    path = tmp_path / "synthetic-missing-snapshots.xlsx"
    wb.save(path)

    result = _run_cli(db_session, script, path)
    assert result.returncode == 2
    assert "--snapshot-date" in result.stderr
    assert await db_session.scalar(select(UploadLog.id)) is None
    await db_session.rollback()

    result = _run_cli(db_session, script, path, "--snapshot-date", str(DAY))
    assert result.returncode == 1, result.stderr
    payload = json.loads(result.stdout)
    summary = payload.get("import_result", payload.get("result"))
    assert summary["status"] == "partial"
    assert summary["tx_new"] == 1
    assert summary["error_message"].startswith("snapshots:")
