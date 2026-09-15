"""
文本切分 — LangChain RecursiveCharacterTextSplitter

按段落 → 空行 → 句子边界递归切分。
chunk size 不再固定：根据文件大小 / 识别出的文字量动态选择
（小文件切小片段保证检索精度，大文件用大片段保证上下文完整、
避免片段数超出上限）。
"""
from langchain_text_splitters import RecursiveCharacterTextSplitter
from backend.app.config import settings

# (字符数下限, chunk_size)；同时用文件字节数兜底（如解析前无法估计字符量）
_CHUNK_TIERS = [
    (5_000, 300),      # 极小文件：短片段，命中更精准
    (30_000, 400),     # 小文件：默认粒度
    (100_000, 600),    # 中等文件：片段更大，保留完整论述
    (float("inf"), 800),  # 大文件：大片段，控制总片段数
]

_separators = [
    "\n\n",    # 段落
    "\n",      # 换行
    "。",       # 中文句号
    "！",       # 中文感叹号
    "？",       # 中文问号
    ". ",      # 英文句号+空格
    "! ",      # 英文感叹号+空格
    "? ",      # 英文问号+空格
    "；",       # 分号
    "，",       # 逗号
    " ",       # 空格
    "",        # 最后兜底：硬切
]

_splitter_cache: dict[tuple[int, int], RecursiveCharacterTextSplitter] = {}


def choose_chunk_params(file_size_bytes: int = 0, total_chars: int = 0) -> tuple[int, int]:
    """根据文件大小/文字量决定 (chunk_size, chunk_overlap)

    优先用解析出的字符数（更贴近内容语义），拿不到时用文件字节数。
    overlap 取 chunk_size 的 1/8，夹在 40~100 之间。
    """
    n = total_chars if total_chars > 0 else file_size_bytes
    chunk_size = settings.CHUNK_SIZE
    for threshold, size in _CHUNK_TIERS:
        if n < threshold:
            chunk_size = size
            break
    chunk_overlap = min(100, max(40, chunk_size // 8))
    return chunk_size, chunk_overlap


def _get_splitter(chunk_size: int, chunk_overlap: int) -> RecursiveCharacterTextSplitter:
    key = (chunk_size, chunk_overlap)
    if key not in _splitter_cache:
        _splitter_cache[key] = RecursiveCharacterTextSplitter(
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
            length_function=len,
            separators=_separators,
        )
    return _splitter_cache[key]


def split_text(
    text: str,
    base_metadata: dict | None = None,
    chunk_size: int | None = None,
    chunk_overlap: int | None = None,
) -> list[dict]:
    """
    切分文本为 chunk 列表

    返回：[{"content": "...", "start_offset": int, "end_offset": int, "metadata": {...}}]
    不传 chunk_size 时回退到全局默认配置。
    """
    if chunk_size is None:
        chunk_size = settings.CHUNK_SIZE
    if chunk_overlap is None:
        chunk_overlap = settings.CHUNK_OVERLAP

    splitter = _get_splitter(chunk_size, chunk_overlap)
    chunks = splitter.create_documents([text])

    result = []
    offset = 0
    for chunk in chunks:
        content = chunk.page_content.strip()
        if not content:
            continue
        # 计算在原文中的大致位置（简单累加，Recursive 切分没有精确 offset）
        idx = text.find(content, offset)
        if idx == -1:
            idx = offset  # 找不到就用当前 offset 兜底
        end = idx + len(content)

        meta = dict(base_metadata or {})
        meta["chunk_size"] = chunk_size
        result.append({
            "content": content,
            "start_offset": idx,
            "end_offset": end,
            "chunk_metadata": meta,
        })
        offset = end

    return result
