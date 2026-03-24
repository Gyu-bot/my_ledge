from collections.abc import AsyncIterator
import sys
from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import get_settings
from app.core.database import get_db_session
from app.main import app
from app.models import Base
from app.services.upload_service import import_transactions_from_workbook


def _sample_workbook_path() -> Path:
    current = Path(__file__).resolve()
    candidates = [
        current.parents[2] / "tmp" / "finance_sample.xlsx",
        current.parents[4] / "tmp" / "finance_sample.xlsx",
    ]
    for candidate in candidates:
        if candidate.exists():
            return candidate
    raise FileNotFoundError("finance_sample.xlsx fixture not found")


@pytest.fixture
def sample_workbook_bytes() -> bytes:
    return _sample_workbook_path().read_bytes()


@pytest.fixture(autouse=True)
def clear_settings_cache() -> AsyncIterator[None]:
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.fixture
def api_headers() -> dict[str, str]:
    return {"X-API-Key": "test-api-key"}


@pytest.fixture
async def async_client(
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> AsyncIterator[AsyncClient]:
    monkeypatch.setenv("API_KEY", "test-api-key")
    monkeypatch.setenv(
        "DATABASE_URL",
        "postgresql+asyncpg://user:pass@localhost:5432/my_ledge",
    )
    get_settings.cache_clear()

    async def override_db_session() -> AsyncIterator[AsyncSession]:
        yield db_session

    app.dependency_overrides[get_db_session] = override_db_session
    transport = ASGITransport(app=app)
    async with AsyncClient(
        transport=transport,
        base_url="http://testserver",
    ) as client:
        yield client
    app.dependency_overrides.clear()


@pytest.fixture
async def db_session(tmp_path: Path) -> AsyncIterator[AsyncSession]:
    db_path = tmp_path / "test.db"
    engine = create_async_engine(f"sqlite+aiosqlite:///{db_path}")

    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)

    session_factory = async_sessionmaker(
        bind=engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )

    async with session_factory() as session:
        yield session

    await engine.dispose()


@pytest.fixture
async def seeded_finance_data(
    db_session: AsyncSession,
    sample_workbook_bytes: bytes,
) -> None:
    await import_transactions_from_workbook(
        db_session=db_session,
        file_bytes=sample_workbook_bytes,
        filename="finance_sample.xlsx",
        snapshot_date=None,
    )
