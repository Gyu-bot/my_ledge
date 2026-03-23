from pathlib import Path

from app.core.config import ROOT_DIR, Settings


def test_settings_load_from_project_root_env_file(tmp_path: Path, monkeypatch) -> None:
    env_file = ROOT_DIR / ".env"
    original_contents = env_file.read_text() if env_file.exists() else None
    env_file.write_text(
        "\n".join(
            [
                "DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/my_ledge",
                "API_KEY=test-api-key",
                "CORS_ORIGINS=https://a.example.com,https://b.example.com",
            ]
        )
    )
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.delenv("API_KEY", raising=False)
    monkeypatch.delenv("CORS_ORIGINS", raising=False)

    try:
        settings = Settings()
    finally:
        if original_contents is None:
            env_file.unlink(missing_ok=True)
        else:
            env_file.write_text(original_contents)

    assert settings.database_url == "postgresql+asyncpg://user:pass@localhost:5432/my_ledge"
    assert settings.api_key == "test-api-key"
    assert settings.cors_origins == ["https://a.example.com", "https://b.example.com"]
