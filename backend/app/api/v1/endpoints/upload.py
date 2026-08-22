from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import Json
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import get_db_session
from app.core.security import require_api_key
from app.models.upload_log import UploadLog
from app.schemas.upload import (
    UploadApplyRequest,
    UploadApplyResponse,
    UploadApplySummary,
    UploadLogListResponse,
    UploadLogResponse,
    UploadPreviewChange,
    UploadPreviewChangeCounts,
    UploadPreviewFieldDelta,
    UploadPreviewResponse,
    UploadPreviewSourceRow,
    UploadPreviewSummary,
    UploadResponse,
    UploadSnapshotSummary,
    UploadTransactionSummary,
)
from app.services.upload_apply_service import (
    UploadApplySelectionError,
    apply_transaction_upload_workbook,
)
from app.services.upload_preview_models import UploadPreviewChangeData
from app.services.upload_preview_service import (
    InvalidUploadWorkbookError,
    preview_transaction_upload_workbook,
)
from app.services.upload_service import import_transactions_from_workbook

router = APIRouter()


@router.get("/upload/logs", response_model=UploadLogListResponse)
async def get_upload_logs(
    db_session: AsyncSession = Depends(get_db_session),
) -> UploadLogListResponse:
    result = await db_session.execute(
        select(UploadLog)
        .order_by(UploadLog.uploaded_at.desc(), UploadLog.id.desc())
        .limit(10)
    )
    items = [
        UploadLogResponse.model_validate(upload_log, from_attributes=True)
        for upload_log in result.scalars().all()
    ]
    return UploadLogListResponse(items=items)


@router.post(
    "/upload", response_model=UploadResponse, dependencies=[Depends(require_api_key)]
)
async def upload_workbook(
    file: Annotated[UploadFile, File(...)],
    snapshot_date: Annotated[date, Form(...)],
    db_session: AsyncSession = Depends(get_db_session),
) -> UploadResponse:
    result = await import_transactions_from_workbook(
        db_session=db_session,
        file_bytes=await file.read(),
        filename=file.filename or "upload.xlsx",
        snapshot_date=snapshot_date,
        excel_password=get_settings().excel_password,
        persist_upload_file=True,
        upload_dir=get_settings().upload_dir,
    )
    return UploadResponse(
        status=result.status,
        upload_id=result.upload_id,
        transactions=UploadTransactionSummary(
            total=result.tx_total,
            new=result.tx_new,
            skipped=result.tx_skipped,
        ),
        snapshots=UploadSnapshotSummary(
            asset_snapshots=result.asset_snapshot_count,
            insurance_contracts=result.insurance_contract_count,
            investments=result.investment_count,
            loans=result.loan_count,
        ),
        error_message=result.error_message,
    )


@router.post(
    "/upload/preview",
    response_model=UploadPreviewResponse,
    dependencies=[Depends(require_api_key)],
)
async def preview_upload_workbook(
    file: Annotated[UploadFile, File(...)],
    snapshot_date: Annotated[date, Form(...)],
    db_session: AsyncSession = Depends(get_db_session),
) -> UploadPreviewResponse:
    try:
        preview = await preview_transaction_upload_workbook(
            db_session=db_session,
            file_bytes=await file.read(),
            excel_password=get_settings().excel_password,
        )
    except InvalidUploadWorkbookError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={"code": "invalid_workbook", "message": str(exc)},
        ) from exc
    return UploadPreviewResponse(
        filename=file.filename or "upload.xlsx",
        snapshot_date=snapshot_date,
        summary=UploadPreviewSummary(
            parsed_transaction_count=preview.parsed_transaction_count,
            safe_change_count=preview.safe_change_count,
            review_required_count=preview.review_required_count,
            change_type_counts=UploadPreviewChangeCounts(
                new=preview.change_type_counts.new,
                unchanged=preview.change_type_counts.unchanged,
                source_fields_changed=preview.change_type_counts.source_fields_changed,
                time_shifted=preview.change_type_counts.time_shifted,
                possible_replacement=preview.change_type_counts.possible_replacement,
                missing_from_latest_export=preview.change_type_counts.missing_from_latest_export,
                possible_duplicate=preview.change_type_counts.possible_duplicate,
                ambiguous=preview.change_type_counts.ambiguous,
            ),
        ),
        safe_changes=[
            _build_upload_preview_change(change) for change in preview.safe_changes
        ],
        review_required_changes=[
            _build_upload_preview_change(change)
            for change in preview.review_required_changes
        ],
    )


@router.post(
    "/upload/apply",
    response_model=UploadApplyResponse,
    dependencies=[Depends(require_api_key)],
)
async def apply_upload_workbook(
    file: Annotated[UploadFile, File(...)],
    snapshot_date: Annotated[date, Form(...)],
    apply_request: Annotated[Json[UploadApplyRequest], Form(...)],
    db_session: AsyncSession = Depends(get_db_session),
) -> UploadApplyResponse:
    try:
        result = await apply_transaction_upload_workbook(
            db_session=db_session,
            file_bytes=await file.read(),
            filename=file.filename or "upload.xlsx",
            snapshot_date=snapshot_date,
            apply_request=apply_request,
            upload_dir=get_settings().upload_dir,
            excel_password=get_settings().excel_password,
        )
    except InvalidUploadWorkbookError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={"code": "invalid_workbook", "message": str(exc)},
        ) from exc
    except UploadApplySelectionError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={
                "code": exc.code,
                "message": exc.message,
                "selection_index": exc.selection_index,
            },
        ) from exc

    return UploadApplyResponse(
        status="success",
        upload_id=result.upload_id,
        filename=file.filename or "upload.xlsx",
        snapshot_date=snapshot_date,
        summary=UploadApplySummary(
            parsed_transaction_count=result.parsed_transaction_count,
            selected_change_count=result.selected_change_count,
            applied_change_count=result.applied_change_count,
            change_type_counts=UploadPreviewChangeCounts(
                new=result.change_type_counts.new,
                unchanged=result.change_type_counts.unchanged,
                source_fields_changed=result.change_type_counts.source_fields_changed,
                time_shifted=result.change_type_counts.time_shifted,
                possible_replacement=result.change_type_counts.possible_replacement,
                missing_from_latest_export=result.change_type_counts.missing_from_latest_export,
                possible_duplicate=result.change_type_counts.possible_duplicate,
                ambiguous=result.change_type_counts.ambiguous,
            ),
        ),
        snapshots=UploadSnapshotSummary(
            asset_snapshots=result.asset_snapshot_count,
            insurance_contracts=result.insurance_contract_count,
            investments=result.investment_count,
            loans=result.loan_count,
        ),
        applied_changes=[
            _build_upload_preview_change(change) for change in result.applied_changes
        ],
    )


def _build_upload_preview_change(
    change: UploadPreviewChangeData,
) -> UploadPreviewChange:
    return UploadPreviewChange(
        change_type=change.change_type,
        review_required=change.review_required,
        auto_apply_safe=change.auto_apply_safe,
        reason=change.reason,
        source_row_hash=change.source_row_hash,
        existing_transaction_id=change.existing_transaction_id,
        candidate_transaction_ids=list(change.candidate_transaction_ids),
        existing_source=(
            UploadPreviewSourceRow(
                date=change.existing_source.date,
                time=change.existing_source.time,
                type=change.existing_source.type,
                category_major=change.existing_source.category_major,
                category_minor=change.existing_source.category_minor,
                description=change.existing_source.description,
                amount=change.existing_source.amount,
                currency=change.existing_source.currency,
                payment_method=change.existing_source.payment_method,
            )
            if change.existing_source is not None
            else None
        ),
        incoming_source=(
            UploadPreviewSourceRow(
                date=change.incoming_source.date,
                time=change.incoming_source.time,
                type=change.incoming_source.type,
                category_major=change.incoming_source.category_major,
                category_minor=change.incoming_source.category_minor,
                description=change.incoming_source.description,
                amount=change.incoming_source.amount,
                currency=change.incoming_source.currency,
                payment_method=change.incoming_source.payment_method,
            )
            if change.incoming_source is not None
            else None
        ),
        field_changes=[
            UploadPreviewFieldDelta(
                field=field_change.field,
                existing_value=field_change.existing_value,
                incoming_value=field_change.incoming_value,
            )
            for field_change in change.field_changes
        ],
        preserved_user_fields=list(change.preserved_user_fields),
        preservation_summary=change.preservation_summary,
    )
