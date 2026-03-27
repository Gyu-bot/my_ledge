from datetime import date, datetime, timezone

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.upload_log import UploadLog


async def test_upload_requires_api_key(
    async_client: AsyncClient,
    sample_workbook_bytes: bytes,
) -> None:
    response = await async_client.post(
        "/api/v1/upload",
        files={
            "file": (
                "finance_sample.xlsx",
                sample_workbook_bytes,
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        },
    )

    assert response.status_code == 401


async def test_upload_returns_import_summary(
    async_client: AsyncClient,
    api_headers: dict[str, str],
    sample_workbook_bytes: bytes,
) -> None:
    response = await async_client.post(
        "/api/v1/upload",
        headers=api_headers,
        data={"snapshot_date": "2026-03-24"},
        files={
            "file": (
                "finance_sample.xlsx",
                sample_workbook_bytes,
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        },
    )

    assert response.status_code == 200
    assert response.json() == {
        "status": "success",
        "upload_id": 1,
        "transactions": {
            "total": 2219,
            "new": 2219,
            "skipped": 0,
        },
        "snapshots": {
            "asset_snapshots": 45,
            "investments": 11,
            "loans": 5,
        },
        "error_message": None,
    }


async def test_get_upload_logs_returns_latest_ten_entries(
    async_client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    logs = [
        UploadLog(
            filename=f"upload-{index}.xlsx",
            snapshot_date=date(2026, 3, 1 + index),
            tx_total=100 + index,
            tx_new=10 + index,
            tx_skipped=90,
            status="success" if index % 2 == 0 else "partial",
            error_message=None if index % 2 == 0 else "snapshots: parse failed",
            uploaded_at=datetime(2026, 3, 1 + index, 9, 0, tzinfo=timezone.utc),
        )
        for index in range(12)
    ]
    db_session.add_all(logs)
    await db_session.commit()

    response = await async_client.get("/api/v1/upload/logs")

    assert response.status_code == 200

    payload = response.json()
    assert len(payload["items"]) == 10
    assert payload["items"][0]["filename"] == "upload-11.xlsx"
    assert payload["items"][0]["status"] == "partial"
    assert payload["items"][0]["tx_total"] == 111
    assert payload["items"][0]["uploaded_at"] == "2026-03-12T09:00:00Z"
    assert payload["items"][-1]["filename"] == "upload-2.xlsx"
