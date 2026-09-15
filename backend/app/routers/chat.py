"""对话 / 问答 API — SSE 流式输出"""
from __future__ import annotations
import json
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from backend.app.database import get_db
from backend.app.models import (
    User, Conversation, Message, KnowledgeSpace, Document,
    AppSettings,
)
from backend.app.dependencies import get_current_user
from backend.app.services import rag_engine, llm_service, retrieval_service, embedding_service, vector_service

router = APIRouter(tags=["问答"])


class ChatRequest(BaseModel):
    space_id: int
    query: str
    conversation_id: Optional[int] = None
    # 聊天框本次消息携带的附件；为空 = 在整个空间范围检索
    document_ids: Optional[list[int]] = None


def _get_user_settings(db: Session, user_id: int) -> AppSettings:
    s = db.query(AppSettings).filter(AppSettings.user_id == user_id).first()
    if not s:
        s = AppSettings(user_id=user_id)
        db.add(s)
        db.commit()
        db.refresh(s)
    return s


def _get_user_space(db: Session, space_id: int, user_id: int) -> KnowledgeSpace | None:
    return (
        db.query(KnowledgeSpace)
        .filter(
            KnowledgeSpace.id == space_id,
            KnowledgeSpace.user_id == user_id,
        )
        .first()
    )


def _emit(obj) -> str:
    return f"data: {json.dumps(obj, ensure_ascii=False)}\n\n"


@router.post("/api/chat/stream")
async def chat_stream(
    req: ChatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """问答（流式 SSE 输出）"""
    space = _get_user_space(db, req.space_id, current_user.id)
    if not space:
        raise HTTPException(status_code=404, detail="知识空间不存在")

    # 1. 检索（带附件时只在附件文档范围内检索）
    attachments = None
    doc_ids = None
    if req.document_ids:
        # 只保留确实属于本空间的文档，过滤伪造/已删除的 id
        docs = (
            db.query(Document.id, Document.filename)
            .filter(
                Document.space_id == space.id,
                Document.id.in_(req.document_ids),
            )
            .all()
        )
        doc_ids = [d.id for d in docs] or None
        attachments = [{"id": d.id, "filename": d.filename} for d in docs] or None

    contexts = rag_engine.retrieve(
        current_user.id, req.space_id, req.query, document_ids=doc_ids
    )

    # 2. 准备 LLM 配置
    settings = _get_user_settings(db, current_user.id)
    if not (settings.llm_api_key and settings.llm_base_url and settings.llm_model):
        return StreamingResponse(
            iter([
                _emit({"type": "contexts", "data": contexts}),
                _emit({"type": "error", "data": "请先在设置页配置大模型 API Key / Base URL / 模型名"}),
                _emit({"type": "done", "data": ""}),
            ]),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    # 3. 阈值判断（有检索结果即放行；未配置 LLM 时不创建对话）
    threshold = (settings.similarity_threshold / 100.0) if settings.similarity_threshold else 0.15
    if not rag_engine.should_answer(contexts, threshold=threshold):
        conv = _get_or_create_conversation(db, req.space_id, req.conversation_id, req.query)
        _save_messages(db, conv.id, req.query,
                       "我在资料中没有找到与这个问题相关的内容。换个方式问一下试试？",
                       contexts, attachments=attachments)
        return StreamingResponse(
            iter([
                _emit({"type": "conversation", "data": {"id": conv.id, "title": conv.title}}),
                _emit({"type": "contexts", "data": contexts}),
                _emit({"type": "no_context", "data": ""}),
                _emit({"type": "done", "data": ""}),
            ]),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    # 4. 正常回答
    llm_cfg = llm_service.LLMConfig(
        api_key=settings.llm_api_key,
        base_url=settings.llm_base_url,
        model=settings.llm_model,
        temperature=settings.temperature / 10.0,
    )

    conv = _get_or_create_conversation(db, req.space_id, req.conversation_id, req.query)
    conversation_id = conv.id
    conversation_meta = {"id": conv.id, "title": conv.title}
    # 取该对话已有的历史消息作为多轮上下文（最近 5 轮）
    history = _load_history(db, conversation_id, limit=10)
    query_text = req.query

    async def generate():
        yield _emit({"type": "conversation", "data": conversation_meta})
        yield _emit({"type": "contexts", "data": contexts})

        full_text = ""
        try:
            async for chunk in rag_engine.generate_answer(contexts, query_text, llm_cfg, history=history):
                full_text += chunk
                yield _emit({"type": "token", "data": chunk})
        except Exception as e:
            db_inner: Session = next(get_db())
            _save_messages(db_inner, conversation_id, query_text,
                           full_text + f"\n\n[错误：{str(e)[:200]}]", contexts,
                           attachments=attachments)
            db_inner.close()
            yield _emit({"type": "error", "data": str(e)[:200]})
            yield _emit({"type": "done", "data": ""})
            return

        db_inner: Session = next(get_db())
        if not full_text.strip():
            # 模型返回空内容（被安全策略拦截等），给用户可理解的提示
            empty_msg = "模型没有返回内容，请换个问法重试，或在设置页检查模型配置。"
            _save_messages(db_inner, conversation_id, query_text, empty_msg, contexts,
                           attachments=attachments)
            db_inner.close()
            yield _emit({"type": "error", "data": empty_msg})
            yield _emit({"type": "done", "data": ""})
            return
        _save_messages(db_inner, conversation_id, query_text, full_text, contexts,
                       attachments=attachments)
        db_inner.close()
        yield _emit({"type": "done", "data": ""})

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


def _get_or_create_conversation(
    db: Session, space_id: int, conversation_id: int | None, first_query: str
) -> Conversation:
    if conversation_id:
        conv = (
            db.query(Conversation)
            .filter(
                Conversation.id == conversation_id,
                Conversation.space_id == space_id,
            )
            .first()
        )
        if conv:
            return conv
        # 传了不属于本空间的对话 id → 忽略，新建（防止串空间写入）
    conv = Conversation(
        space_id=space_id,
        title=(first_query[:50] + "...") if len(first_query) > 50 else first_query,
    )
    db.add(conv)
    db.commit()
    db.refresh(conv)
    return conv


def _load_history(db: Session, conversation_id: int, limit: int = 10) -> list[dict]:
    """取对话最近的历史消息（多轮上下文）

    - 过滤掉生成失败的回答，并用中性占位保持 user/assistant 角色交替，
      避免连续 user 消息影响部分兼容 API 的解析
    """
    rows = (
        db.query(Message.role, Message.content)
        .filter(Message.conversation_id == conversation_id)
        .order_by(Message.created_at.desc(), Message.id.desc())
        .limit(limit)
        .all()
    )
    history = []
    for role, content in reversed(rows):
        if role == "assistant" and "[错误：" in content:
            content = "（上一轮回答生成失败，请忽略该轮）"
        history.append({"role": role, "content": content})
    return history


def _save_messages(
    db: Session,
    conv_id: int,
    query: str,
    answer: str,
    contexts: list[dict],
    attachments: list[dict] | None = None,
):
    conv = db.query(Conversation).filter(Conversation.id == conv_id).first()
    if conv:
        conv.updated_at = datetime.utcnow()
    db.add(Message(
        conversation_id=conv_id, role="user", content=query, attachments=attachments
    ))
    refs = [{
        "document_id": c["document_id"],
        "filename": c.get("filename", ""),
        "chunk_index": c.get("chunk_index"),
        "score": c.get("rrf_score"),
        "snippet": c["content"][:200],
    } for c in contexts]
    db.add(Message(conversation_id=conv_id, role="assistant", content=answer, references=refs))
    db.commit()


# === 对话列表 / 历史 ===

@router.get("/api/spaces/{space_id}/conversations")
def list_conversations(
    space_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    space = _get_user_space(db, space_id, current_user.id)
    if not space:
        raise HTTPException(status_code=404, detail="知识空间不存在")

    convs = (
        db.query(Conversation)
        .filter(Conversation.space_id == space_id)
        .order_by(Conversation.updated_at.desc(), Conversation.id.desc())
        .all()
    )
    return [{
        "id": c.id,
        "title": c.title,
        "created_at": c.created_at.isoformat() if c.created_at else "",
        "updated_at": c.updated_at.isoformat() if c.updated_at else "",
    } for c in convs]


@router.get("/api/conversations/{conv_id}")
def get_conversation(
    conv_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    conv = db.query(Conversation).filter(Conversation.id == conv_id).first()
    if not conv:
        raise HTTPException(status_code=404, detail="对话不存在")
    # 通过 space 校验归属
    space = _get_user_space(db, conv.space_id, current_user.id)
    if not space:
        raise HTTPException(status_code=404, detail="对话不存在")

    messages = (
        db.query(Message)
        .filter(Message.conversation_id == conv_id)
        .order_by(Message.created_at.asc(), Message.id.asc())
        .all()
    )
    return {
        "id": conv.id,
        "space_id": conv.space_id,
        "title": conv.title,
        "messages": [{
            "id": m.id,
            "role": m.role,
            "content": m.content,
            "references": m.references,
            "attachments": m.attachments,
            "created_at": m.created_at.isoformat() if m.created_at else "",
        } for m in messages],
    }


@router.delete("/api/conversations/{conv_id}")
def delete_conversation(
    conv_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    conv = db.query(Conversation).filter(Conversation.id == conv_id).first()
    if not conv:
        raise HTTPException(status_code=404, detail="对话不存在")
    space = _get_user_space(db, conv.space_id, current_user.id)
    if not space:
        raise HTTPException(status_code=404, detail="对话不存在")
    db.delete(conv)
    db.commit()
    return {"ok": True}


# === 搜索测试 ===

@router.get("/api/search")
def search_test(
    space_id: int,
    q: str,
    top_k: int = 5,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    space = _get_user_space(db, space_id, current_user.id)
    if not space:
        raise HTTPException(status_code=404, detail="知识空间不存在")
    if not q.strip():
        raise HTTPException(status_code=400, detail="请输入问题")

    q_emb = embedding_service.get_embedding(q)
    vec_raw = vector_service.query_vectors(current_user.id, space_id, q_emb, top_k=top_k)

    from backend.app.services import keyword_service
    kw_raw = keyword_service.keyword_search(space_id, q, top_k=top_k)

    hybrid = retrieval_service.hybrid_retrieve(
        current_user.id, space_id, q, top_k=top_k, query_embedding=q_emb
    )

    app_set = _get_user_settings(db, current_user.id)
    thr = (app_set.similarity_threshold / 100.0) if app_set.similarity_threshold else 0.15

    return {
        "query": q,
        "space_id": space_id,
        "top_k": top_k,
        "threshold_passed": rag_engine.should_answer(hybrid, threshold=thr),
        "hybrid": [{
            "id": c["id"],
            "filename": c.get("filename"),
            "chunk_index": c.get("chunk_index"),
            "rrf_score": c.get("rrf_score"),
            "vector_score": c.get("vector_score"),
            "keyword_score": c.get("keyword_score"),
            "sources": c.get("sources"),
            "content": c["content"][:300],
        } for c in hybrid],
        "vector_raw": [{
            "id": v["id"],
            "score": v["score"],
            "content": v["document"][:200],
        } for v in vec_raw],
        "keyword_raw": [{
            "id": k["id"],
            "score": k["score"],
            "content": k["content"][:200],
        } for k in kw_raw],
    }
