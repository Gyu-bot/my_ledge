from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import get_db_session
from app.core.security import require_api_key
from app.schemas.upload import (
    UploadResponse,
    UploadSnapshotSummary,
    UploadTransactionSummary,
)
from app.services.upload_service import import_transactions_from_workbook

router = APIRouter()


@router.post("/upload", response_model=UploadResponse, dependencies=[Depends(require_api_key)])
async def upload_workbook(
    file: Annotated[UploadFile, File(...)],
    snapshot_date: Annotated[date | None, Form()] = None,
    db_session: AsyncSession = Depends(get_db_session),
) -> UploadResponse:
    result = await import_transactions_from_workbook(
        db_session=db_session,
        file_bytes=await file.read(),
        filename=file.filename or "upload.xlsx",
        snapshot_date=snapshot_date,
        excel_password=get_settings().excel_password,
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
            investments=result.investment_count,
            loans=result.loan_count,
        ),
        error_message=result.error_message,
    )
