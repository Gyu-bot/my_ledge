from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import api_router
from app.core.config import get_settings
from app.core.deprecation import DeprecationHeaderMiddleware, mark_deprecated_routes


def create_app() -> FastAPI:
    app = FastAPI(title="my_ledge API", version="0.1.0")

    settings = get_settings()
    if settings.cors_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.cors_origins,
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )

    app.include_router(api_router)
    # T060: deprecation marks for read endpoints the read surface replaces.
    mark_deprecated_routes(app)
    app.add_middleware(DeprecationHeaderMiddleware)
    return app


app = create_app()
