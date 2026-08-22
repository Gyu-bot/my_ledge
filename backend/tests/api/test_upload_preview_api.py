from io import BytesIO

from httpx import AsyncClient
from openpyxl import Workbook


def build_workbook_without_snapshot_sheet() -> bytes:
    workbook = Workbook()
    workbook.active.title = "가계부 내역"
    workbook.active.append(
        [
            "날짜",
            "시간",
            "타입",
            "대분류",
            "소분류",
            "내용",
            "금액",
            "화폐",
            "결제수단",
            "메모",
        ]
    )
    buffer = BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


async def test_upload_preview_requires_api_key(
    async_client: AsyncClient,
    sample_workbook_bytes: bytes,
) -> None:
    response = await async_client.post(
        "/api/v1/upload/preview",
        data={"snapshot_date": "2026-03-24"},
        files={
            "file": (
                "finance_sample.xlsx",
                sample_workbook_bytes,
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        },
    )

    assert response.status_code == 401


async def test_upload_preview_requires_snapshot_date(
    async_client: AsyncClient,
    api_headers: dict[str, str],
    sample_workbook_bytes: bytes,
) -> None:
    response = await async_client.post(
        "/api/v1/upload/preview",
        headers=api_headers,
        files={
            "file": (
                "finance_sample.xlsx",
                sample_workbook_bytes,
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        },
    )

    assert response.status_code == 422


async def test_upload_preview_returns_parsed_summary(
    async_client: AsyncClient,
    api_headers: dict[str, str],
    sample_workbook_bytes: bytes,
) -> None:
    response = await async_client.post(
        "/api/v1/upload/preview",
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

    payload = response.json()
    assert payload["filename"] == "finance_sample.xlsx"
    assert payload["snapshot_date"] == "2026-03-24"

    summary = payload["summary"]
    assert summary["parsed_transaction_count"] == 2357
    assert summary["safe_change_count"] + summary["review_required_count"] == len(
        payload["safe_changes"]
    ) + len(payload["review_required_changes"])
    assert isinstance(payload["safe_changes"], list)
    assert isinstance(payload["review_required_changes"], list)


async def test_upload_preview_rejects_invalid_workbook(
    async_client: AsyncClient,
    api_headers: dict[str, str],
) -> None:
    response = await async_client.post(
        "/api/v1/upload/preview",
        headers=api_headers,
        data={"snapshot_date": "2026-03-24"},
        files={
            "file": (
                "broken.xlsx",
                build_workbook_without_snapshot_sheet(),
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        },
    )

    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "invalid_workbook"
