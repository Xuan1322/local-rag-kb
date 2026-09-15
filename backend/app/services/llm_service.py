"""
LLM 调用服务 — httpx 流式，兼容 OpenAI Chat Completions 格式

所有 OpenAI 兼容 API 都能走：
- OpenAI (api.openai.com/v1)
- DeepSeek (api.deepseek.com/v1)
- 本地 vLLM / LM Studio (自定义 base_url)

不存 API Key（用户必须在设置页配置）。
调用时通过 parameters 传入 provider / api_key / base_url / model。
"""
from __future__ import annotations
import json
import httpx
from typing import AsyncGenerator


class LLMConfig:
    """LLM 运行时配置（从设置 API 拿到）"""
    def __init__(
        self,
        api_key: str,
        base_url: str,
        model: str,
        temperature: float = 0.7,
    ):
        # 确保 base_url 不斜杠结尾
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.temperature = temperature

    @property
    def chat_url(self) -> str:
        return f"{self.base_url}/chat/completions"


async def stream_chat(
    config: LLMConfig,
    messages: list[dict],
    timeout: float = 60.0,
) -> AsyncGenerator[str, None]:
    """
    流式调用 LLM Chat Completions

    SSE 风格的 yield：
      yield chunk_text  (增量文本片段)

    注意：我们在后端直接处理 OpenAI 的 stream=True 协议，
    解析每个 data: {...} 事件，yield delta.content
    """
    if not config.api_key or not config.base_url or not config.model:
        raise ValueError("LLM 未配置：请在设置页填写 API Key / Base URL / 模型名")

    async with httpx.AsyncClient(timeout=timeout) as client:
        async with client.stream(
            "POST",
            config.chat_url,
            headers={
                "Authorization": f"Bearer {config.api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": config.model,
                "messages": messages,
                "temperature": config.temperature,
                "stream": True,
            },
        ) as resp:
            if resp.status_code != 200:
                err_text = await resp.aread()
                raise RuntimeError(
                    f"LLM API 返回 {resp.status_code}: {err_text.decode()[:500]}"
                )

            # 解析 SSE
            buffer = ""
            async for chunk in resp.aiter_text():
                buffer += chunk
                # SSE 事件之间用 \n\n 分隔
                while "\n\n" in buffer:
                    event, buffer = buffer.split("\n\n", 1)
                    # 取 data: 行
                    for line in event.split("\n"):
                        line = line.strip()
                        if not line.startswith("data:"):
                            continue
                        data_str = line[5:].strip()
                        if data_str == "[DONE]":
                            return
                        try:
                            data = json.loads(data_str)
                        except json.JSONDecodeError:
                            continue

                        delta = data.get("choices", [{}])[0].get("delta", {})
                        content = delta.get("content", "")
                        if content:
                            yield content


def build_rag_messages(
    query: str,
    contexts: list[dict],
    history: list[dict] | None = None,
) -> list[dict]:
    """
    构造 RAG Prompt —— system + 多轮历史 + (context + user question)

    contexts 是 retrieval_service.hybrid_retrieve 的返回结果
    history 是同一对话中之前的消息：[{"role": "user"/"assistant", "content": ...}]
    """
    # 把每个 chunk 格式化为带来源的段落
    context_blocks = []
    for i, c in enumerate(contexts, start=1):
        source = c.get("filename", f"片段{c['document_id']}")
        snippet = c["content"].strip()
        context_blocks.append(f"[来源{i}: {source}]\n{snippet}")

    context_text = "\n\n---\n\n".join(context_blocks) if context_blocks else "(无相关资料)"

    system_prompt = """你是一个基于资料回答问题的助手。规则：
1. 只根据下方提供的参考资料回答，不要编造资料外的内容。
2. 如果资料中找不到相关内容，直接说"我在资料中没有找到与这个问题相关的内容"，不要硬编。
3. 回答时适当引用对应的来源编号（如 [来源1]、[来源2]），让用户知道依据在哪里。
4. 回答使用中文，简洁清晰。
5. 可以结合对话历史理解用户的追问（例如"那它呢"指的是什么），但每轮回答的事实依据只能来自最新提供的参考资料。"""

    user_prompt = f"""参考资料：

{context_text}

---

问题：{query}"""

    messages = [{"role": "system", "content": system_prompt}]
    if history:
        for m in history:
            role = m.get("role")
            if role in ("user", "assistant") and m.get("content"):
                messages.append({"role": role, "content": m["content"]})
    messages.append({"role": "user", "content": user_prompt})
    return messages


def build_no_relevant_message() -> list[dict]:
    """检索结果全低于阈值时，给用户的友好提示"""
    return []
