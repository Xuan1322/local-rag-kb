"""SQLAlchemy + SQLite 初始化"""
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from backend.app.config import settings

engine = create_engine(
    settings.sqlalchemy_url(),
    connect_args={"check_same_thread": False},  # SQLite 多线程需要
    echo=False,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    """FastAPI 依赖：获取数据库会话"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """创建所有表（如果不存在），并对旧库执行幂等的轻量列迁移"""
    import sqlite3
    import backend.app.models  # 触发模型注册
    Base.metadata.create_all(bind=engine)

    # SQLite 无法由 create_all 给已存在的表补列，这里手动 ALTER（幂等）
    migrations = [
        ("messages", "attachments", "TEXT"),  # 消息附件 JSON
    ]
    conn = sqlite3.connect(str(settings.DB_PATH))
    try:
        for table, column, col_type in migrations:
            cols = {row[1] for row in conn.execute(f"PRAGMA table_info({table})").fetchall()}
            if column not in cols:
                conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {col_type}")
                conn.commit()
    finally:
        conn.close()
