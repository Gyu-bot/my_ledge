import pytest
from fastapi import HTTPException, status

from app.core.config import get_settings
from app.core.security import require_api_key


def test_require_api_key_returns_500_when_api_key_is_missing(monkeypatch) -> None:
    get_settings.cache_clear()
    monkeypatch.setenv("API_KEY", "")
    monkeypatch.setenv("DATABASE_URL", "postgresql+asyncpg://user:pass@localhost:5432/my_ledge")

    with pytest.raises(HTTPException) as exc_info:
        require_api_key()

    assert exc_info.value.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR
    assert exc_info.value.detail == "API key is not configured."

    get_settings.cache_clear()
