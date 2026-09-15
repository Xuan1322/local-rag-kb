"""
混合检索 — 向量 Top10 + 关键词 Top10 → RRF 融合取 Top5

RRF (Reciprocal Rank Fusion):
  score(d) = Σ 1 / (k + rank_i(d))
  k 是平滑常数，默认 60（业界常用）
  rank 从 1 开始，排名越靠前得分越高

纯向量 vs 关键词的问题：
- 用户输入"退款政策"，向量可能匹配"售后条款"但漏掉精确的"退款政策"段落
- 用户输入"怎么退钱"，关键词搜不到"退款"但向量能匹配上
RRF 融合两边的排名，取综合最优
"""
from __future__ import annotations
from backend.app.config import settings
from backend.app.services import vector_service, keyword_service, embedding_service
from backend.app.models import TextChunk
from sqlalchemy.orm import Session
from backend.app.database import SessionLocal


def hybrid_retrieve(
    user_id: int,
    space_id: int,
    query: str,
    top_k: int | None = None,
    query_embedding: list[float] | None = None,
    document_ids: list[int] | None = None,
) -> list[dict]:
    """
    混合检索：向量 + 关键词 → RRF 融合

    返回 top_k 个结果，每个结果：
    {id, document_id, content, score (融合后), sources: ["vector", "keyword"],
     vector_score, keyword_score, metadata, filename, chunk_index}

    query_embedding 可传入预计算的 query 向量（搜索测试页三路对比时避免重复编码）
    document_ids 非空时只在指定文档范围内检索（聊天框附件场景）
    """
    top_k = top_k or settings.DEFAULT_TOP_K
    rrf_k = settings.RRF_K  # 60
    vec_top = settings.VECTOR_TOP_K  # 10
    kw_top = settings.KEYWORD_TOP_K  # 10

    # 1. 向量检索
    if query_embedding is None:
        query_embedding = embedding_service.get_embedding(query)
    vec_results = vector_service.query_vectors(
        user_id, space_id, query_embedding, top_k=vec_top, document_ids=document_ids
    )
    # 转为统一格式
    vec_rank = {}
    for rank, r in enumerate(vec_results, start=1):
        vec_rank[int(r["id"])] = {
            "rank": rank,
            "score": r["score"],
            "raw": r,
        }

    # 2. 关键词检索
    kw_results = keyword_service.keyword_search(
        space_id, query, top_k=kw_top, document_ids=document_ids
    )
    kw_rank = {}
    for rank, r in enumerate(kw_results, start=1):
        kw_rank[int(r["id"])] = {
            "rank": rank,
            "score": r["score"],
            "raw": r,
        }

    # 3. RRF 融合
    all_ids = set(vec_rank.keys()) | set(kw_rank.keys())
    fused = []
    for cid in all_ids:
        rrf_score = 0.0
        sources = []
        vec_score = None
        kw_score = None

        if cid in vec_rank:
            rrf_score += 1.0 / (rrf_k + vec_rank[cid]["rank"])
            sources.append("vector")
            vec_score = vec_rank[cid]["score"]

        if cid in kw_rank:
            rrf_score += 1.0 / (rrf_k + kw_rank[cid]["rank"])
            sources.append("keyword")
            kw_score = kw_rank[cid]["score"]

        fused.append({
            "id": cid,
            "rrf_score": rrf_score,
            "sources": sources,
            "vector_score": vec_score,
            "keyword_score": kw_score,
        })

    # 4. 按 RRF 分数降序取 top_k
    fused.sort(key=lambda x: x["rrf_score"], reverse=True)
    top_results = fused[:top_k]

    # 5. 补全 content / document_id / metadata（从 DB 查）
    results = _enrich(top_results)
    return results


def _enrich(rankings: list[dict]) -> list[dict]:
    """根据 chunk id 补齐内容、文件名等信息"""
    if not rankings:
        return []

    db: Session = SessionLocal()
    try:
        ids = [r["id"] for r in rankings]
        chunks = db.query(TextChunk).filter(TextChunk.id.in_(ids)).all()
        chunk_map = {c.id: c for c in chunks}

        results = []
        for r in rankings:
            c = chunk_map.get(r["id"])
            if not c:
                continue
            # 拿文件名
            filename = ""
            try:
                from backend.app.models import Document
                doc = db.query(Document).filter(Document.id == c.document_id).first()
                filename = doc.filename if doc else ""
            except Exception:
                pass

            results.append({
                "id": r["id"],
                "document_id": c.document_id,
                "content": c.content,
                "rrf_score": r["rrf_score"],
                "sources": r["sources"],
                "vector_score": r["vector_score"],
                "keyword_score": r["keyword_score"],
                "chunk_index": c.chunk_index,
                "filename": filename,
                "metadata": c.chunk_metadata,
            })
        return results
    finally:
        db.close()
