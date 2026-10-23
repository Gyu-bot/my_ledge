from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import Json
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import get_db_session
from app.core.security import require_api_key
from app.schemas.upload_review import (
    ReviewApplyRequest,
    ReviewContext,
    ReviewResponse,
    ReviewRevision,
)
from app.services import upload_review_service as service
from app.services.upload_preview_service import InvalidUploadWorkbookError

router = APIRouter(prefix="/upload/review", dependencies=[Depends(require_api_key)])


async def invoke(awaitable):
    try:
        return await awaitable
    except service.ReviewError as exc:
        raise HTTPException(
            status_code=exc.status_code,
            detail={"code": exc.code, "message": exc.message},
        ) from exc
    except InvalidUploadWorkbookError as exc:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "invalid_workbook",
                "message": "Invalid or unsupported BankSalad workbook",
            },
        ) from exc
    except DBAPIError as exc:
        # Never leak SQL parameters, private ledger values, or plan payloads.
        raise HTTPException(
            status_code=409,
            detail={
                "code": "database_conflict",
                "message": "Database transaction conflicted; reconcile operation before retry",
            },
        ) from exc


@router.post("/prepare", response_model=ReviewResponse)
async def prepare(
    file: Annotated[UploadFile, File(...)],
    snapshot_date: Annotated[date, Form(...)],
    context: Annotated[Json[ReviewContext], Form(...)],
    db: AsyncSession = Depends(get_db_session),
):
    return await invoke(
        service.prepare_review(
            db,
            file_bytes=await file.read(),
            filename=file.filename or "upload.xlsx",
            snapshot_date=snapshot_date,
            context=context,
            excel_password=get_settings().excel_password,
        )
    )


@router.get("/{operation_id}", response_model=ReviewResponse)
async def get_operation(operation_id: str, db: AsyncSession = Depends(get_db_session)):
    return await invoke(service.get_review(db, operation_id))


@router.post("/{operation_id}/decisions", response_model=ReviewResponse)
async def revise(
    operation_id: str,
    request: ReviewRevision,
    db: AsyncSession = Depends(get_db_session),
):
    return await invoke(service.revise_review(db, operation_id, request))


@router.post("/{operation_id}/apply", response_model=ReviewResponse)
async def apply(
    operation_id: str,
    file: Annotated[UploadFile, File(...)],
    snapshot_date: Annotated[date, Form(...)],
    apply_request: Annotated[Json[ReviewApplyRequest], Form(...)],
    db: AsyncSession = Depends(get_db_session),
):
    settings = get_settings()
    return await invoke(
        service.apply_review(
            db,
            operation_id,
            file_bytes=await file.read(),
            filename=file.filename or "upload.xlsx",
            snapshot_date=snapshot_date,
            request=apply_request,
            upload_dir=settings.upload_dir,
            excel_password=settings.excel_password,
        )
    )
