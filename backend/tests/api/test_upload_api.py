from httpx import AsyncClient


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
