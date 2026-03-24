from fastapi import APIRouter, Depends

from app.core.security import require_api_key
from app.models import Base
from app.schemas.schema_doc import SchemaDocumentResponse
from app.services.schema_service import build_schema_document

router = APIRouter()


@router.get("/schema", response_model=SchemaDocumentResponse, dependencies=[Depends(require_api_key)])
async def get_schema_document() -> SchemaDocumentResponse:
    return build_schema_document(Base.metadata)
