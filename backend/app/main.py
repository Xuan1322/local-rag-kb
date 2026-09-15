"""FastAPI 主入口"""
import threading
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.app.config import settings as app_settings
from backend.app.database import init_db
from backend.app.routers import auth as auth_router, spaces, documents, chat, settings as settings_router

app = FastAPI(title="本地轻量 RAG 知识库", version="0.2.0")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=app_settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup():
    # 幂等建表：已存在的表不动，用户数据持久保留
    init_db()
    print("[startup] 数据库就绪")

    # FTS 关键词索引一致性检查（缺失/不全则全量重建）
    try:
        from backend.app.services import keyword_service
        keyword_service.ensure_fts_consistency()
    except Exception as e:
        print(f"[startup] FTS 索引检查跳过: {e}")

    # 后台预加载 Embedding 模型
    def _warmup():
        try:
            from backend.app.services import embedding_service
            embedding_service.get_embedding("warmup")
            print("[startup] Embedding 模型预加载完成")
        except Exception as e:
            print(f"[startup] Embedding 预加载跳过: {e}")
    threading.Thread(target=_warmup, daemon=True).start()
    print("[startup] 启动完成，Embedding 正在后台预加载...")


# 挂载路由
app.include_router(auth_router.router)
app.include_router(spaces.router)
app.include_router(documents.router)
app.include_router(chat.router)
app.include_router(settings_router.router)


@app.get("/api/health")
def health():
    return {"status": "ok", "version": "0.2.0"}
