from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    neo4j_uri: str = "bolt://127.0.0.1:17687"
    neo4j_username: str = "neo4j"
    neo4j_password: str = "wwm_local_dev_password"
    neo4j_database: str = "neo4j"
    neo4j_query_timeout: float = 8.0

    supabase_url: str = ""
    supabase_publishable_key: str = ""
    auth_disabled: bool = False

    openrouter_api_key: str = ""
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    openrouter_model: str = "google/gemini-2.5-flash-lite"
    openrouter_timeout: float = 45.0

    max_question_chars: int = Field(default=1200, ge=100, le=4000)
    retrieval_limit: int = Field(default=8, ge=3, le=15)


@lru_cache
def get_settings() -> Settings:
    return Settings()
