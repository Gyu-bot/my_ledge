from fastapi import FastAPI

from app.api.v1.router import api_router


def create_app() -> FastAPI:
    app = FastAPI(title="my_ledge API", version="0.1.0")
    app.include_router(api_router)
    return app


app = create_app()

