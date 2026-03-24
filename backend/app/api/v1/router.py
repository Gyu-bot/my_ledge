from fastapi import APIRouter

from app.api.v1.endpoints.assets import router as assets_router
from app.api.v1.endpoints.health import router as health_router
from app.api.v1.endpoints.schema import router as schema_router
from app.api.v1.endpoints.transactions import router as transactions_router
from app.api.v1.endpoints.upload import router as upload_router

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(health_router)
api_router.include_router(upload_router)
api_router.include_router(schema_router)
api_router.include_router(assets_router)
api_router.include_router(transactions_router)
