"""
关键词检索 — SQLite FTS5 + LIKE 降级

为什么用 FTS5？SQLite 原生支持，零额外依赖，
支持中文分词（需要 tokenizer=unicode61）。
如果 FTS5 不可用（旧版 SQLite），降级为 LIKE 模糊匹配。
"""
from __future__ import annotations
import sqlite3
from backend.app.config import settings


def _ensure_fts_table():
    """确保 FTS5 虚拟表存在（首次调用时创建）"""
    conn = sqlite3.connect(str(settings.DB_PATH))
    try:
        # 检查是否存在
        cur = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='text_chunks_fts'"
        )
        if cur.fetchone():
            return

        # 创建 FTS5 表，关联 text_chunks 的内容
        conn.execute("""
            CREATE VIRTUAL TABLE text_chunks_fts USING fts5(
                content,
                chunk_id UNINDEXED,
                document_id UNINDEXED,
                tokenize='unicode61'
            )
        """)
        conn.commit()
    finally:
        conn.close()


def _index_all_chunks():
    """将所有 text_chunks 数据灌入 FTS 表（启动/重建时调用）"""
    from sqlalchemy.orm import Session
    from backend.app.database import SessionLocal
    from backend.app.models import TextChunk

    _ensure_fts_table()
    db: Session = SessionLocal()
    conn = sqlite3.connect(str(settings.DB_PATH))
    try:
        conn.execute("DELETE FROM text_chunks_fts")
        chunks = db.query(TextChunk).all()
        rows = [(c.content, c.id, c.document_id) for c in chunks]
        conn.executemany(
            "INSERT INTO text_chunks_fts (content, chunk_id, document_id) VALUES (?, ?, ?)",
            rows,
        )
        conn.commit()
    finally:
        conn.close()
        db.close()


def ensure_fts_consistency():
    """启动时调用：FTS 表缺失或与 text_chunks 行数不一致时全量重建

    场景：数据持久化后首次启动（FTS 表刚建好是空的）、异常中断导致索引不全。
    """
    from sqlalchemy.orm import Session
    from backend.app.database import SessionLocal
    from backend.app.models import TextChunk

    _ensure_fts_table()
    db: Session = SessionLocal()
    conn = sqlite3.connect(str(settings.DB_PATH))
    try:
        db_count = db.query(TextChunk).count()
        fts_count = conn.execute("SELECT COUNT(*) FROM text_chunks_fts").fetchone()[0]
    finally:
        conn.close()
        db.close()

    if db_count != fts_count:
        print(f"[startup] FTS 索引不一致（DB {db_count} 行 / FTS {fts_count} 行），重建关键词索引...")
        _index_all_chunks()


def index_chunk(chunk_id: int, document_id: int, content: str):
    """新增一个 chunk 到 FTS"""
    _ensure_fts_table()
    conn = sqlite3.connect(str(settings.DB_PATH))
    try:
        conn.execute(
            "INSERT INTO text_chunks_fts (content, chunk_id, document_id) VALUES (?, ?, ?)",
            (content, chunk_id, document_id),
        )
        conn.commit()
    finally:
        conn.close()


def remove_chunk(chunk_id: int):
    """从 FTS 删除一个 chunk"""
    _ensure_fts_table()
    conn = sqlite3.connect(str(settings.DB_PATH))
    try:
        conn.execute("DELETE FROM text_chunks_fts WHERE chunk_id = ?", (chunk_id,))
        conn.commit()
    finally:
        conn.close()


def remove_chunks_bulk(chunk_ids: list[int]):
    """批量从 FTS 删除 chunks（删除整个空间时用，避免逐条开关连接）"""
    if not chunk_ids:
        return
    _ensure_fts_table()
    conn = sqlite3.connect(str(settings.DB_PATH))
    try:
        placeholders = ",".join("?" for _ in chunk_ids)
        conn.execute(
            f"DELETE FROM text_chunks_fts WHERE chunk_id IN ({placeholders})",
            chunk_ids,
        )
        conn.commit()
    finally:
        conn.close()


def keyword_search(
    space_id: int,
    query: str,
    top_k: int = 10,
    document_ids: list[int] | None = None,
) -> list[dict]:
    """
    关键词检索（FTS5 优先，失败降级 LIKE）
    返回：[{"id": chunk_id, "document_id": int, "content": str, "score": float, "source": "keyword"}]
    score 是 FTS 的 rank（越小越好），转换为相似度分数（越大越好）

    document_ids 非空时只在指定文档范围内检索。
    """
    from sqlalchemy.orm import Session
    from backend.app.database import SessionLocal
    from backend.app.models import TextChunk, Document

    doc_filter_sql = ""
    doc_filter_params: list = []
    if document_ids:
        placeholders = ",".join("?" for _ in document_ids)
        doc_filter_sql = f" AND f.document_id IN ({placeholders})"
        doc_filter_params = [int(x) for x in document_ids]

    db: Session = SessionLocal()
    conn = sqlite3.connect(str(settings.DB_PATH))
    try:
        # 先尝试 FTS5
        _ensure_fts_table()
        try:
            sql = f"""
                SELECT f.chunk_id, f.document_id, f.content, rank
                FROM text_chunks_fts f
                JOIN documents d ON f.document_id = d.id
                WHERE d.space_id = ?{doc_filter_sql} AND text_chunks_fts MATCH ?
                ORDER BY rank
                LIMIT ?
            """
            # unicode61 tokenizer 下，中文查询返回 None → 跳过 FTS 走 LIKE
            fts_query = _build_fts_query(query)
            if fts_query is None:
                raise Exception("中文查询跳过 FTS，降级 LIKE")
            cur = conn.execute(sql, [space_id, *doc_filter_params, fts_query, top_k])
            rows = cur.fetchall()

            if rows:
                # rank 越小越好，转换为 [0, 1] 分数
                max_rank = rows[-1][3] if rows else 1
                results = []
                for chunk_id, doc_id, content, rank in rows:
                    sim = 1.0 - (rank / (max_rank + 1))
                    results.append({
                        "id": chunk_id,
                        "document_id": doc_id,
                        "content": content,
                        "score": max(0.0, sim),
                        "source": "keyword",
                    })
                return results
        except Exception:
            pass  # FTS 出错就降级

        # 降级：SQLAlchemy + LIKE（对中文更可靠）
        # 但不能整串 LIKE——"给出简历的项目经历"不会在 content 里完整出现
        # 正确做法：拆成关键词，任何一个关键词命中就算匹配
        keywords = _extract_keywords(query)
        if not keywords:
            return []

        from sqlalchemy import or_
        like_conditions = [TextChunk.content.like(f"%{kw}%") for kw in keywords]
        chunk_query = (
            db.query(TextChunk)
            .join(Document, TextChunk.document_id == Document.id)
            .filter(Document.space_id == space_id)
            .filter(or_(*like_conditions))
        )
        if document_ids:
            chunk_query = chunk_query.filter(TextChunk.document_id.in_([int(x) for x in document_ids]))
        chunks = chunk_query.limit(top_k).all()
        # 每个 chunk 匹配到几个关键词 → 分数加权
        results = []
        for c in chunks:
            matched = sum(1 for kw in keywords if kw in c.content)
            score = 0.3 + 0.2 * matched  # 命中越多分越高，基础 0.3
            results.append({
                "id": c.id,
                "document_id": c.document_id,
                "content": c.content,
                "score": min(score, 0.9),
                "source": "keyword",
            })
        # 按分数排序
        results.sort(key=lambda r: r["score"], reverse=True)
        return results[:top_k]
    finally:
        conn.close()
        db.close()


def _build_fts_query(query: str) -> str:
    """构建 FTS5 查询串"""
    import re

    has_chinese = bool(re.search(r'[\u4e00-\u9fff]', query))
    if has_chinese:
        return None  # 含中文 → 跳过 FTS，走 LIKE 关键词匹配

    parts = []
    for token in re.split(r"(\W+)", query):
        token = token.strip()
        if not token:
            continue
        if re.match(r"^[a-zA-Z0-9_\-]+$", token):
            parts.append(f'"{token}"')
        else:
            parts.append(token)
    return " ".join(parts) or query


def _extract_keywords(query: str) -> list[str]:
    """把自然语言查询拆成有意义的关键词列表

    规则：
    1. 去掉停用词/疑问词（什么、怎么、给出、介绍、一下...）
    2. 去掉单字虚词（的、是、在、和、与...）
    3. 按停用词/标点切分出多个片段
    4. 保留 2 字以上的连续片段
    5. 如果拆不出来，回退到提取双字窗口
    6. 限制最多 5 个关键词
    """
    import re

    # 常见中文停用词/疑问词/单字虚词
    STOPWORDS = {
        "什么", "怎么", "如何", "为什么", "哪", "哪些", "哪个",
        "请", "给出", "给我", "告诉我", "介绍", "一下", "请问",
        "的", "了", "是", "在", "和", "与", "或", "及",
        "吗", "呢", "啊", "吧", "呀",
        "有", "没有", "能", "可以", "会",
        "我", "你", "他", "她", "它",
        "要", "想", "做", "看", "问",
    }

    # 把停用词替换成分隔符，然后按分隔符切
    working = query
    for sw in sorted(STOPWORDS, key=len, reverse=True):  # 长的先替换
        working = working.replace(sw, "|")

    # 按 | 或非中文字符切
    tokens = re.split(r"[|\s,，。.?!？!；;、]+", working)

    keywords = []
    for token in tokens:
        token = token.strip()
        if len(token) >= 2 and token not in STOPWORDS:
            keywords.append(token)

    # 如果拆出来太少（<2 个），尝试从原 query 提取连续双字窗口补充
    if len(keywords) < 2:
        q = query
        i = 0
        while i < len(q) - 1 and len(keywords) < 5:
            bigram = q[i:i + 2]
            if bigram not in STOPWORDS and bigram not in keywords:
                keywords.append(bigram)
            i += 1

    # 去重 + 限制数量
    seen = set()
    result = []
    for kw in keywords:
        if kw not in seen and len(kw) >= 2:
            seen.add(kw)
            result.append(kw)
        if len(result) >= 5:
            break

    return result
