from collections.abc import AsyncIterator
from datetime import date
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


def _workbook_path(filename: str) -> Path:
    current = Path(__file__).resolve()
    aliases = {
        "finance_sample.xlsx": ["finance_sample.xlsx", "fs_260311.xlsx"],
        "sample_260324.xlsx": ["sample_260324.xlsx", "fs_260324.xlsx"],
        "sample_260326.xlsx": ["sample_260326.xlsx", "fs_260326.xlsx"],
        "sample_260407.xlsx": ["sample_260407.xlsx", "fs_260407.xlsx"],
    }
    names = aliases.get(filename, [filename])
    candidates: list[Path] = []
    for name in names:
        candidates.extend([
            current.parents[2] / "tmp" / name,
            current.parents[4] / "tmp" / name,
        ])
    for candidate in candidates:
        if candidate.exists():
            return candidate
    raise FileNotFoundError(f"{filename} fixture not found")


@pytest.fixture
def sample_workbook_bytes() -> bytes:
    return _workbook_path("finance_sample.xlsx").read_bytes()


@pytest.fixture
def rolling_window_workbook_bytes() -> bytes:
    return _workbook_path("sample_260324.xlsx").read_bytes()


@pytest.fixture
def rolling_window_workbook_v2_bytes() -> bytes:
    return _workbook_path("sample_260326.xlsx").read_bytes()


@pytest.fixture
def latest_workbook_bytes() -> bytes:
    return _workbook_path("sample_260407.xlsx").read_bytes()


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
        snapshot_date=date(2026, 3, 24),
    )
