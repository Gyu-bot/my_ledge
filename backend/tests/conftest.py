from collections.abc import AsyncIterator
import sys
from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.main import app


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


@pytest.fixture
async def async_client() -> AsyncIterator[AsyncClient]:
    transport = ASGITransport(app=app)
    async with AsyncClient(
        transport=transport,
        base_url="http://testserver",
    ) as client:
        yield client
