"""
文档处理流水线（异步任务模式，但 MVP 用同步函数 + FastAPI BackgroundTasks）

流程：
  pending → parsing → chunking → embedding → ready
                                              └─ 任何阶段失败 → failed
"""
from __future__ import annotations
import traceback
from sqlalchemy.orm import Session
from backend.app.database import SessionLocal
from backend.app.models import Document, TextChunk
from backend.app.config import settings
from backend.app.services import parser_service, chunking_service, embedding_service, vector_service, keyword_service


def process_document(document_id: int, user_id: int):
    """
    完整处理一个文档：解析 → 切分 → Embedding → 写 Chroma
    任何异常会把文档状态置为 failed 并记录 error_message
    """
    db = SessionLocal()
    try:
        doc = db.query(Document).filter(Document.id == document_id).first()
        if not doc:
            return

        # 1. 解析
        _update_status(db, doc, "parsing")
        parsed_parts = parser_service.parse_file(doc.file_path)
        full_text_parts = []
        for part in parsed_parts:
            full_text_parts.append((part["text"], part["metadata"]))

        # 2. 切分（chunk size 按文件大小 / 识别出的文字量动态决定）
        _update_status(db, doc, "chunking")
        total_chars = sum(len(text) for text, _ in full_text_parts)
        chunk_size, chunk_overlap = chunking_service.choose_chunk_params(
            file_size_bytes=doc.file_size or 0,
            total_chars=total_chars,
        )
        all_chunks = []
        for text, base_meta in full_text_parts:
            if not text.strip():
                continue
            chunks = chunking_service.split_text(
                text,
                base_metadata=base_meta,
                chunk_size=chunk_size,
                chunk_overlap=chunk_overlap,
            )
            all_chunks.extend(chunks)

        # 限制 chunk 数量防止内存爆炸
        if len(all_chunks) > settings.MAX_CHUNKS_PER_DOC:
            all_chunks = all_chunks[:settings.MAX_CHUNKS_PER_DOC]

        # 重建前先清理旧 chunk 的向量/FTS（重试场景：旧索引不删会成为永久孤儿）
        old_chunk_ids = [
            cid for (cid,) in
            db.query(TextChunk.id).filter(TextChunk.document_id == doc.id).all()
        ]
        if old_chunk_ids:
            db.query(TextChunk).filter(TextChunk.document_id == doc.id).delete()
            # 先提交释放 SQLite 写锁，否则独立连接删 FTS 会 database is locked
            db.commit()
            try:
                vector_service.delete_chunks(user_id, doc.space_id, old_chunk_ids)
            except Exception as e:
                print(f"[process_document] 清理旧向量失败 doc={doc.id}: {e}")
            keyword_service.remove_chunks_bulk(old_chunk_ids)

        if not all_chunks:
            # 解析结果为空（如空文件）：旧索引已清，文档标记就绪但 0 片段
            doc.status = "ready"
            db.commit()
            return

        chunk_orm_objects = []
        for i, chunk in enumerate(all_chunks):
            chunk_orm_objects.append(TextChunk(
                document_id=doc.id,
                chunk_index=i,
                content=chunk["content"],
                start_offset=chunk["start_offset"],
                end_offset=chunk["end_offset"],
                chunk_metadata=chunk["chunk_metadata"],
            ))
        db.add_all(chunk_orm_objects)
        db.flush()  # 获取 ID

        # 3. Embedding + 写 Chroma
        _update_status(db, doc, "embedding")
        chunk_ids = [c.id for c in chunk_orm_objects]
        contents = [c.content for c in chunk_orm_objects]
        metadatas = [{"document_id": doc.id, "chunk_index": c.chunk_index,
                      **(c.chunk_metadata or {})} for c in chunk_orm_objects]

        embeddings = embedding_service.get_embeddings(contents)
        vector_service.add_vectors(
            user_id=user_id,
            space_id=doc.space_id,
            chunk_ids=chunk_ids,
            contents=contents,
            embeddings=embeddings,
            metadatas=metadatas,
        )

        # 3b. 同步写入 FTS（关键词检索依赖）
        for cid, content in zip(chunk_ids, contents):
            keyword_service.index_chunk(cid, doc.id, content)

        # 完成
        doc.status = "ready"
        doc.error_message = None
        db.commit()

    except Exception as e:
        try:
            doc = db.query(Document).filter(Document.id == document_id).first()
            if doc:
                doc.status = "failed"
                doc.error_message = f"{type(e).__name__}: {str(e)[:500]}"
                db.commit()
        except Exception:
            pass
    finally:
        db.close()


def _update_status(db: Session, doc: Document, status: str):
    doc.status = status
    db.commit()
    db.refresh(doc)
