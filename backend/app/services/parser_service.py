"""
文档解析服务 — 支持 PDF / DOCX / TXT / MD / 图片(OCR)

返回格式：[{"text": "...", "metadata": {"page": 1, "start": 0}}]
page 对 PDF 有意义，DOCX / TXT / 图片默认 page=1
"""
from pathlib import Path

# 图片扩展名走 OCR 文字识别
IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".bmp"}

_ocr_engine = None


def _get_ocr():
    """OCR 引擎单例（首次使用才加载，避免拖慢普通文档的处理）"""
    global _ocr_engine
    if _ocr_engine is None:
        try:
            from rapidocr_onnxruntime import RapidOCR
        except ImportError as e:
            raise ValueError(
                "图片识别组件未安装，请在后端环境执行: pip install rapidocr-onnxruntime"
            ) from e
        _ocr_engine = RapidOCR()
    return _ocr_engine


def parse_file(file_path: str | Path) -> list[dict]:
    """根据扩展名自动选择解析器"""
    path = Path(file_path)
    ext = path.suffix.lower()

    if ext == ".pdf":
        return _parse_pdf(path)
    elif ext == ".docx":
        return _parse_docx(path)
    elif ext in (".txt", ".md"):
        return _parse_txt(path)
    elif ext in IMAGE_EXTENSIONS:
        return _parse_image(path)
    else:
        raise ValueError(f"不支持的文件格式: {ext}")


def _parse_pdf(path: Path) -> list[dict]:
    """PDF 解析 — 按页返回"""
    from pypdf import PdfReader
    reader = PdfReader(str(path))
    pages = []
    char_offset = 0
    for page_num, page in enumerate(reader.pages, start=1):
        text = page.extract_text() or ""
        if text.strip():
            pages.append({
                "text": text,
                "metadata": {"page": page_num, "start_offset": char_offset},
            })
            char_offset += len(text)
    return pages


def _parse_docx(path: Path) -> list[dict]:
    """DOCX 解析 — 按段落合并为一页"""
    from docx import Document
    doc = Document(str(path))
    paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
    full_text = "\n".join(paragraphs)
    return [{
        "text": full_text,
        "metadata": {"page": 1, "start_offset": 0},
    }]


def _parse_txt(path: Path) -> list[dict]:
    """TXT 解析 — 整个文件一页"""
    encoding = _detect_encoding(path)
    with open(path, "r", encoding=encoding) as f:
        text = f.read()
    return [{
        "text": text,
        "metadata": {"page": 1, "start_offset": 0},
    }]


def _parse_image(path: Path) -> list[dict]:
    """图片 OCR — 识别图片中的中英文文字（离线 ONNX 模型，无需外部服务）"""
    import cv2
    import numpy as np

    # np.fromfile + imdecode 兼容中文路径（cv2.imread 遇到中文路径会返回 None）
    data = np.fromfile(str(path), dtype=np.uint8)
    img = cv2.imdecode(data, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("图片读取失败，文件可能已损坏")

    result, _ = _get_ocr()(img)
    lines = [
        item[1].strip()
        for item in (result or [])
        if item and len(item) > 1 and item[1] and item[1].strip()
    ]
    if not lines:
        raise ValueError("图片中未识别到文字")

    return [{
        "text": "\n".join(lines),
        "metadata": {"page": 1, "start_offset": 0},
    }]


def _detect_encoding(path: Path) -> str:
    """尝试检测文本编码"""
    try:
        with open(path, "r", encoding="utf-8") as f:
            f.read()
        return "utf-8"
    except UnicodeDecodeError:
        try:
            with open(path, "r", encoding="gbk") as f:
                f.read()
            return "gbk"
        except UnicodeDecodeError:
            return "utf-8"


SUPPORTED_EXTENSIONS = {".pdf", ".docx", ".txt", ".md"} | IMAGE_EXTENSIONS


def is_supported(filename: str) -> bool:
    """判断文件格式是否支持"""
    return Path(filename).suffix.lower() in SUPPORTED_EXTENSIONS
