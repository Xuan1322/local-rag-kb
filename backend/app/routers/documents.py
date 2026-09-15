"""文档管理 API"""
import re
import uuid
import shutil
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, BackgroundTasks
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from backend.app.database import get_db
from backend.app.models import User, Document, KnowledgeSpace, TextChunk
from backend.app.config import settings
from backend.app.dependencies import get_current_user
from backend.app.services import document_service, parser_service, vector_service, keyword_service

router = APIRouter(tags=["文档"])


# === Response Models ===

class DocResponse(BaseModel):
    id: int
    space_id: int
    filename: str
    file_size: int
    mime_type: Optional[str]
    status: str
    error_message: Optional[str]
    chunk_count: int = 0
    created_at: str
    updated_at: str

    class Config:
        from_attributes = True


def _doc_to_response(doc: Document, chunk_count: int = 0) -> dict:
    return {
        "id": doc.id,
        "space_id": doc.space_id,
        "filename": doc.filename,
        "file_size": doc.file_size,
        "mime_type": doc.mime_type,
        "status": doc.status,
        "error_message": doc.error_message,
        "chunk_count": chunk_count,
        "created_at": doc.created_at.isoformat() if doc.created_at else "",
        "updated_at": doc.updated_at.isoformat() if doc.updated_at else "",
    }


def _get_user_space(db: Session, space_id: int, user_id: int) -> KnowledgeSpace | None:
    """校验空间属于当前用户"""
    return (
        db.query(KnowledgeSpace)
        .filter(
            KnowledgeSpace.id == space_id,
            KnowledgeSpace.user_id == user_id,
        )
        .first()
    )


def _get_user_doc(db: Session, doc_id: int, user_id: int) -> Document | None:
    """校验文档属于当前用户的空间"""
    return (
        db.query(Document)
        .join(KnowledgeSpace, Document.space_id == KnowledgeSpace.id)
        .filter(
            Document.id == doc_id,
            KnowledgeSpace.user_id == user_id,
        )
        .first()
    )


def _safe_filename(raw: str) -> str:
    """清洗上传文件名：取 basename，替换 Windows 非法字符，防路径穿越"""
    name = Path(raw or "").name  # 去掉任何路径部分（含 ../）
    name = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", name).strip()
    return name or "未命名文件"


# === 路由 ===

@router.post("/api/spaces/{space_id}/documents", response_model=DocResponse)
async def upload_document(
    space_id: int,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """上传文档（后台异步处理）"""
    space = _get_user_space(db, space_id, current_user.id)
    if not space:
        raise HTTPException(status_code=404, detail="知识空间不存在")

    if not parser_service.is_supported(file.filename):
        raise HTTPException(
            status_code=400,
            detail="不支持的文件格式。支持: PDF / Word(.docx) / TXT / Markdown / 图片(PNG、JPG、WEBP、BMP)",
        )

    content = await file.read()
    size_mb = len(content) / (1024 * 1024)
    if size_mb > settings.MAX_FILE_SIZE_MB:
        raise HTTPException(
            status_code=400,
            detail=f"文件过大（{size_mb:.1f}MB），最大支持 {settings.MAX_FILE_SIZE_MB}MB",
        )

    space_dir = settings.FILES_DIR / str(space_id)
    space_dir.mkdir(parents=True, exist_ok=True)
    safe_name = _safe_filename(file.filename)
    # uuid 前缀避免重名/删除后序号复用导致覆盖旧文件
    dest_path = space_dir / f"{uuid.uuid4().hex[:8]}_{safe_name}"
    with open(dest_path, "wb") as f:
        f.write(content)

    doc = Document(
        space_id=space_id,
        filename=safe_name,
        file_path=str(dest_path),
        file_size=len(content),
        mime_type=file.content_type,
        status="pending",
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    background_tasks.add_task(document_service.process_document, doc.id, current_user.id)

    return _doc_to_response(doc)


@router.get("/api/spaces/{space_id}/documents", response_model=list[DocResponse])
def list_documents(
    space_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """列出空间下所有文档（必须属于当前用户）"""
    space = _get_user_space(db, space_id, current_user.id)
    if not space:
        raise HTTPException(status_code=404, detail="知识空间不存在")

    docs = db.query(Document).filter(Document.space_id == space_id).order_by(Document.created_at.desc()).all()
    result = []
    for d in docs:
        chunk_count = db.query(TextChunk).filter(TextChunk.document_id == d.id).count()
        result.append(_doc_to_response(d, chunk_count))
    return result


@router.get("/api/documents/{doc_id}", response_model=DocResponse)
def get_document(
    doc_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    doc = _get_user_doc(db, doc_id, current_user.id)
    if not doc:
        raise HTTPException(status_code=404, detail="文档不存在")
    chunk_count = db.query(TextChunk).filter(TextChunk.document_id == doc.id).count()
    return _doc_to_response(doc, chunk_count)


@router.delete("/api/documents/{doc_id}")
def delete_document(
    doc_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    doc = _get_user_doc(db, doc_id, current_user.id)
    if not doc:
        raise HTTPException(status_code=404, detail="文档不存在")

    space_id = doc.space_id

    try:
        Path(doc.file_path).unlink(missing_ok=True)
    except Exception:
        pass

    chunk_ids = [c.id for c in db.query(TextChunk).filter(TextChunk.document_id == doc_id).all()]

    db.delete(doc)
    db.commit()

    if chunk_ids:
        vector_service.delete_chunks(current_user.id, space_id, chunk_ids)
        keyword_service.remove_chunks_bulk(chunk_ids)

    return {"ok": True}


@router.post("/api/documents/{doc_id}/retry", response_model=DocResponse)
def retry_document(
    doc_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """重新处理失败的文档"""
    doc = _get_user_doc(db, doc_id, current_user.id)
    if not doc:
        raise HTTPException(status_code=404, detail="文档不存在")
    if doc.status not in ("failed",):
        raise HTTPException(status_code=400, detail="只有处理失败的文档可以重试")

    doc.status = "pending"
    doc.error_message = None
    db.commit()

    background_tasks.add_task(document_service.process_document, doc.id, current_user.id)
    return _doc_to_response(doc)


@router.get("/api/documents/{doc_id}/preview")
def preview_document(
    doc_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """获取文档识别出的文字内容（用于预览）

    优先读已入库的分块（OCR/解析的结果，速度快且与检索内容一致）；
    文档尚未处理完时回退为现场解析。
    """
    doc = _get_user_doc(db, doc_id, current_user.id)
    if not doc:
        raise HTTPException(status_code=404, detail="文档不存在")

    chunks = (
        db.query(TextChunk.content)
        .filter(TextChunk.document_id == doc_id)
        .order_by(TextChunk.chunk_index.asc())
        .all()
    )
    if chunks:
        text = "\n\n".join(c[0] for c in chunks)
        source = "indexed"
    else:
        try:
            parsed = parser_service.parse_file(doc.file_path)
            text = "\n\n".join(p["text"] for p in parsed)
            source = "parsed"
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"解析失败: {str(e)}")

    return {
        "filename": doc.filename,
        "status": doc.status,
        "source": source,
        "text": text[:50000],
        "total_chars": len(text),
    }


@router.get("/api/documents/{doc_id}/raw")
def raw_document(
    doc_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """读取原始文件（图片缩略图/原图预览用，带鉴权）"""
    from fastapi.responses import FileResponse

    doc = _get_user_doc(db, doc_id, current_user.id)
    if not doc:
        raise HTTPException(status_code=404, detail="文档不存在")
    if not Path(doc.file_path).exists():
        raise HTTPException(status_code=404, detail="文件已被移除")
    return FileResponse(doc.file_path, filename=doc.filename)
