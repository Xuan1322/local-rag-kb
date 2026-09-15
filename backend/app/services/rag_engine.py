"""
RAG 引擎 — 把检索 + LLM 调用 + 阈值过滤串起来

输入：space_id + query + llm_config
输出：检索到的 contexts + （若过阈值）可流式的 LLM 生成器
"""
from __future__ import annotations
from typing import AsyncGenerator
from backend.app.config import settings
from backend.app.services import retrieval_service, llm_service


def retrieve(
    user_id: int,
    space_id: int,
    query: str,
    document_ids: list[int] | None = None,
) -> list[dict]:
    """纯检索（供搜索测试页和 RAG 都用）

    document_ids 非空时只在指定文档范围内检索（聊天框附件场景）。
    """
    return retrieval_service.hybrid_retrieve(
        user_id=user_id,
        space_id=space_id,
        query=query,
        document_ids=document_ids,
    )


def should_answer(contexts: list[dict], threshold: float | None = None) -> bool:
    """
    阈值过滤：有任何检索结果就放行（让 LLM 自己判断资料够不够）

    策略：只要 hybrid 检索返回了至少 1 条结果，就传给 LLM。
    LLM 会根据实际资料内容决定回答——如果资料不相关，它会说
    "在你的资料中没有找到关于XX的内容"，而不是后端先截断。

    threshold 参数保留用于搜索测试页展示参考，问答链路不再用它硬截断。
    """
    return len(contexts) > 0


async def generate_answer(
    contexts: list[dict],
    query: str,
    llm_config: llm_service.LLMConfig,
    history: list[dict] | None = None,
) -> AsyncGenerator[str, None]:
    """
    构造 Prompt（含多轮历史）→ 流式调用 LLM
    """
    messages = llm_service.build_rag_messages(query, contexts, history=history)
    async for chunk in llm_service.stream_chat(llm_config, messages):
        yield chunk
