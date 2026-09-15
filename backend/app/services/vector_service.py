"""ChromaDB 向量存储服务封装"""
from __future__ import annotations
import chromadb
from chromadb.config import Settings as ChromaSettings
from backend.app.config import settings

_client: chromadb.ClientAPI | None = None


def get_chroma_client() -> chromadb.ClientAPI:
    """获取（或初始化）Chroma 客户端（单例）"""
    global _client
    if _client is None:
        _client = chromadb.PersistentClient(
            path=str(settings.CHROMA_DIR),
            settings=ChromaSettings(anonymized_telemetry=False),
        )
    return _client


def _collection_name(user_id: int, space_id: int) -> str:
    """按用户命名空间隔离 collection"""
    return f"user_{user_id}_space_{space_id}"


def get_or_create_collection(user_id: int, space_id: int) -> chromadb.Collection:
    """为某个用户的某个知识空间获取（或创建）独立的 collection"""
    client = get_chroma_client()
    name = _collection_name(user_id, space_id)
    return client.get_or_create_collection(
        name=name,
        metadata={"user_id": user_id, "space_id": space_id},
    )


def add_vectors(
    user_id: int,
    space_id: int,
    chunk_ids: list[int],
    contents: list[str],
    embeddings: list[list[float]],
    metadatas: list[dict] | None = None,
):
    """向某个空间的 collection 写入向量"""
    collection = get_or_create_collection(user_id, space_id)
    collection.add(
        ids=[str(cid) for cid in chunk_ids],
        documents=contents,
        embeddings=embeddings,
        metadatas=metadatas,
    )


def delete_chunks(user_id: int, space_id: int, chunk_ids: list[int]):
    """删除指定 chunk 的向量"""
    collection = get_or_create_collection(user_id, space_id)
    collection.delete(ids=[str(cid) for cid in chunk_ids])


def query_vectors(
    user_id: int,
    space_id: int,
    query_embedding: list[float],
    top_k: int = 10,
    document_ids: list[int] | None = None,
) -> list[dict]:
    """向量检索，返回 top_k 结果

    document_ids 非空时只在指定文档范围内检索（聊天框附件场景）。
    """
    collection = get_or_create_collection(user_id, space_id)
    where = None
    if document_ids:
        where = {"document_id": {"$in": [int(x) for x in document_ids]}}
    results = collection.query(
        query_embeddings=[query_embedding],
        n_results=top_k,
        where=where,
    )

    items = []
    ids = results["ids"][0]
    distances = results["distances"][0]
    documents = results["documents"][0]
    metadatas = results.get("metadatas", [[None] * top_k])[0]

    for i in range(len(ids)):
        items.append({
            "id": int(ids[i]),
            "document": documents[i],
            "distance": distances[i],
            "score": 1 - distances[i],
            "metadata": metadatas[i] if metadatas else None,
        })
    return items


def delete_space_collection(user_id: int, space_id: int):
    """删除某个空间的 collection（删除知识空间时调用）"""
    client = get_chroma_client()
    name = _collection_name(user_id, space_id)
    try:
        client.delete_collection(name)
    except Exception:
        pass
