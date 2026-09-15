"""
Embedding 服务 — 懒加载 bge-small-zh-v1.5（首次调用时才加载）
"""
from __future__ import annotations
import os

# 必须在 import sentence_transformers 之前设置
os.environ.setdefault("HF_ENDPOINT", "https://hf-mirror.com")
os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY", "1")

from backend.app.config import settings  # noqa: E402

_model = None


def _get_model():
    """懒加载 embedding 模型（全局单例）"""
    global _model
    if _model is None:
        from sentence_transformers import SentenceTransformer
        # 加 device='cpu' 避免 meta tensor 问题；加 backend='onnx' 用 ONNX Runtime 推理
        _model = SentenceTransformer(
            settings.EMBEDDING_MODEL_NAME,
            local_files_only=False,  # 允许检查 hf-mirror 更新（如果缓存有问题会重新下载）
            device="cpu",
        )
    return _model


def get_embeddings(texts: list[str]) -> list[list[float]]:
    """
    将文本列表转换为向量
    返回：2D list，每行是一个 512 维向量
    """
    model = _get_model()
    embeddings = model.encode(
        texts,
        normalize_embeddings=True,
        show_progress_bar=False,
        batch_size=32,
    )
    return embeddings.tolist()


def get_embedding(text: str) -> list[float]:
    """单条文本 Embedding"""
    return get_embeddings([text])[0]


def model_is_loaded() -> bool:
    """判断模型是否已加载"""
    return _model is not None
