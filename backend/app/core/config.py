from functools import lru_cache
import json
from pathlib import Path
from typing import Annotated

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

ROOT_DIR = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=ROOT_DIR / ".env",
        extra="ignore",
    )

    database_url: str = Field(validation_alias="DATABASE_URL")
    excel_password: str | None = Field(default=None, validation_alias="EXCEL_PASSWORD")
    api_key: str | None = Field(default=None, validation_alias="API_KEY")
    cors_origins: Annotated[list[str], NoDecode] = Field(
        default_factory=list,
        validation_alias="CORS_ORIGINS",
    )

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, value: object) -> list[str]:
        if value is None or value == "":
            return []
        if isinstance(value, list):
            return [str(item).strip() for item in value if str(item).strip()]
        if isinstance(value, str):
            text = value.strip()
            if not text:
                return []
            if text.startswith("["):
                try:
                    parsed = json.loads(text)
                except json.JSONDecodeError:
                    parsed = None
                if isinstance(parsed, list):
                    return [str(item).strip() for item in parsed if str(item).strip()]
            return [item.strip() for item in text.split(",") if item.strip()]
        return [str(value).strip()] if str(value).strip() else []


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
