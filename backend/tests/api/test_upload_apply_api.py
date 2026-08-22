import json

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from datetime import date
from pathlib import Path

from app.api.v1 import endpoints
from app.schemas.upload import UploadApplyRequest, UploadApplySelection
from app.services.upload_apply_models import TransactionUploadApplyResult
from app.services.upload_apply_service import UploadApplySelectionError
from app.services.upload_preview_models import (
    UploadPreviewChangeCounts,
    UploadPreviewChangeData,
    UploadPreviewFieldDeltaData,
)


@pytest.fixture
def repository_workbook_bytes() -> bytes:
    return b"repository-fixture"


async def test_upload_apply_requires_api_key(
    async_client: AsyncClient,
    repository_workbook_bytes: bytes,
) -> None:
    response = await async_client.post(
        "/api/v1/upload/apply",
        data={"snapshot_date": "2026-03-24", "apply_request": '{"confirmation": true}'},
        files={
            "file": (
                "finance_sample.xlsx",
                repository_workbook_bytes,
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        },
    )

    assert response.status_code == 401


async def test_upload_apply_rejects_invalid_selection_payload(
    async_client: AsyncClient,
    api_headers: dict[str, str],
    repository_workbook_bytes: bytes,
) -> None:
    response = await async_client.post(
        "/api/v1/upload/apply",
        headers=api_headers,
        data={
            "snapshot_date": "2026-03-24",
            "apply_request": json.dumps(
                {
                    "confirmation": True,
                    "selections": [],
                }
            ),
        },
        files={
            "file": (
                "finance_sample.xlsx",
                repository_workbook_bytes,
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        },
    )

    assert response.status_code == 422
    details = response.json()["detail"]
    assert isinstance(details, list)
    assert any("selections" in str(item.get("loc", [])) for item in details)


async def test_upload_apply_returns_success_payload_from_service(
    monkeypatch: pytest.MonkeyPatch,
    async_client: AsyncClient,
    api_headers: dict[str, str],
    repository_workbook_bytes: bytes,
    tmp_path: Path,
) -> None:
    async def fake_apply_transaction_upload_workbook(
        db_session: AsyncSession,
        file_bytes: bytes,
        filename: str,
        snapshot_date: date,
        apply_request: UploadApplyRequest,
        upload_dir: Path,
        excel_password: str | None = None,
    ) -> TransactionUploadApplyResult:
        if not db_session:
            raise AssertionError("missing db_session")
        if not file_bytes or not filename or not snapshot_date or not apply_request:
            raise AssertionError("missing apply arguments")
        assert upload_dir == tmp_path / "uploads"
        return TransactionUploadApplyResult(
            upload_id=17,
            parsed_transaction_count=1,
            selected_change_count=1,
            applied_change_count=1,
            change_type_counts=UploadPreviewChangeCounts(
                new=1,
                unchanged=0,
                source_fields_changed=0,
                time_shifted=0,
                possible_replacement=0,
                missing_from_latest_export=0,
                possible_duplicate=0,
                ambiguous=0,
            ),
            applied_changes=(
                UploadPreviewChangeData(
                    change_type="new",
                    review_required=False,
                    auto_apply_safe=True,
                    reason="preview-safe",
                    source_row_hash="row-hash",
                    existing_transaction_id=None,
                    candidate_transaction_ids=(),
                    existing_source=None,
                    incoming_source=None,
                    field_changes=(
                        UploadPreviewFieldDeltaData(
                            field="description",
                            existing_value=None,
                            incoming_value="cafeteria",
                        ),
                    ),
                    preserved_user_fields=(),
                    preservation_summary="",
                ),
            ),
            tx_new=1,
            tx_skipped=0,
            asset_snapshot_count=2,
            insurance_contract_count=1,
            investment_count=3,
            loan_count=4,
        )

    monkeypatch.setattr(
        endpoints.upload,
        "apply_transaction_upload_workbook",
        fake_apply_transaction_upload_workbook,
    )
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path / "uploads"))

    response = await async_client.post(
        "/api/v1/upload/apply",
        headers=api_headers,
        data={
            "snapshot_date": "2026-03-24",
            "apply_request": UploadApplyRequest(
                confirmation=True,
                selections=[
                    UploadApplySelection(
                        change_type="new",
                        source_row_hash="row-hash",
                        existing_transaction_id=None,
                    )
                ],
            ).model_dump_json(),
        },
        files={
            "file": (
                "finance_sample.xlsx",
                repository_workbook_bytes,
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "success"
    assert payload["upload_id"] == 17
    assert payload["filename"] == "finance_sample.xlsx"
    assert payload["summary"]["parsed_transaction_count"] == 1
    assert payload["summary"]["selected_change_count"] == 1
    assert payload["summary"]["applied_change_count"] == 1
    assert payload["summary"]["change_type_counts"]["new"] == 1
    assert payload["snapshots"] == {
        "asset_snapshots": 2,
        "insurance_contracts": 1,
        "investments": 3,
        "loans": 4,
    }


async def test_upload_apply_forwards_selection_errors(
    monkeypatch: pytest.MonkeyPatch,
    async_client: AsyncClient,
    api_headers: dict[str, str],
    repository_workbook_bytes: bytes,
) -> None:
    async def fake_apply_transaction_upload_workbook(
        db_session: AsyncSession,
        file_bytes: bytes,
        filename: str,
        snapshot_date: date,
        apply_request: UploadApplyRequest,
        upload_dir: Path,
        excel_password: str | None = None,
    ) -> TransactionUploadApplyResult:
        if not db_session:
            raise AssertionError("missing db_session")
        if not file_bytes or not filename or not snapshot_date or not apply_request:
            raise AssertionError("missing apply arguments")
        raise UploadApplySelectionError(
            code="invalid_selection",
            message="selection not found",
            selection_index=1,
        )

    monkeypatch.setattr(
        endpoints.upload,
        "apply_transaction_upload_workbook",
        fake_apply_transaction_upload_workbook,
    )

    response = await async_client.post(
        "/api/v1/upload/apply",
        headers=api_headers,
        data={
            "snapshot_date": "2026-03-24",
            "apply_request": UploadApplyRequest(
                confirmation=True,
                selections=[
                    UploadApplySelection(
                        change_type="new",
                        source_row_hash="unknown",
                        existing_transaction_id=None,
                    )
                ],
            ).model_dump_json(),
        },
        files={
            "file": (
                "finance_sample.xlsx",
                repository_workbook_bytes,
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        },
    )

    assert response.status_code == 422
    detail = response.json()["detail"]
    assert detail["code"] == "invalid_selection"
    assert detail["selection_index"] == 1
