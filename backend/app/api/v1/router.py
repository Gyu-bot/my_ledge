from fastapi import APIRouter

from app.api.v1.endpoints.analytics import router as analytics_router
from app.api.v1.endpoints.assets import router as assets_router
from app.api.v1.endpoints.auto_classification import router as auto_classification_router
from app.api.v1.endpoints.data_management import router as data_management_router
from app.api.v1.endpoints.health import router as health_router
from app.api.v1.endpoints.loan_mapping import router as loan_mapping_router
from app.api.v1.endpoints.schema import router as schema_router
from app.api.v1.endpoints.settings import router as settings_router
from app.api.v1.endpoints.transactions import router as transactions_router
from app.api.v1.endpoints.upload import router as upload_router

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(health_router)
api_router.include_router(upload_router)
api_router.include_router(schema_router)
api_router.include_router(settings_router)
api_router.include_router(auto_classification_router)
api_router.include_router(analytics_router)
api_router.include_router(assets_router)
api_router.include_router(loan_mapping_router)
api_router.include_router(data_management_router)
api_router.include_router(transactions_router)
