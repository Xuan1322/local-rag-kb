"""
后端配置 — 所有可配置项集中在这里
"""
import os
from pathlib import Path
from pydantic_settings import BaseSettings

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent  # rag-kb/


class Settings(BaseSettings):
    """应用配置"""

    # === 数据路径 ===
    DATA_DIR: Path = PROJECT_ROOT / "data"
    DB_PATH: Path = PROJECT_ROOT / "data" / "app.db"
    CHROMA_DIR: Path = PROJECT_ROOT / "data" / "chroma"
    FILES_DIR: Path = PROJECT_ROOT / "data" / "files"

    # === 服务 ===
    BACKEND_HOST: str = "127.0.0.1"
    BACKEND_PORT: int = 8765
    CORS_ORIGINS: list[str] = ["http://localhost:5173", "http://localhost:8765"]

    # === 数据层 ===
    SQLALCHEMY_DATABASE_URL: str = "sqlite:///{db_path}"

    # === 认证 ===
    JWT_SECRET: str = os.environ.get("JWT_SECRET", "rag-kb-dev-secret-change-in-production")
    JWT_EXPIRE_HOURS: int = 168  # 7 天

    # === LLM ===
    # 用户必须在设置页手动填，无默认值
    LLM_PROVIDER: str = ""          # "openai" | "deepseek" | "custom"
    LLM_API_KEY: str = ""
    LLM_BASE_URL: str = ""          # 如 https://api.deepseek.com/v1
    LLM_MODEL: str = ""             # 如 deepseek-chat / gpt-4o-mini

    # === Embedding ===
    EMBEDDING_MODEL_NAME: str = "BAAI/bge-small-zh-v1.5"

    # === 检索 ===
    DEFAULT_TOP_K: int = 5
    DEFAULT_SIMILARITY_THRESHOLD: float = 0.15
    VECTOR_TOP_K: int = 10
    KEYWORD_TOP_K: int = 10
    RRF_K: int = 60

    # === 文档处理 ===
    MAX_FILE_SIZE_MB: int = 20
    MAX_CHUNKS_PER_DOC: int = 200
    CHUNK_SIZE: int = 400
    CHUNK_OVERLAP: int = 50

    def ensure_dirs(self):
        """确保所有数据目录存在"""
        for d in [self.DATA_DIR, self.CHROMA_DIR, self.FILES_DIR]:
            d.mkdir(parents=True, exist_ok=True)

    def sqlalchemy_url(self) -> str:
        return self.SQLALCHEMY_DATABASE_URL.format(db_path=str(self.DB_PATH))


settings = Settings()
settings.ensure_dirs()
