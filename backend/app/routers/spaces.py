"""知识空间 CRUD API"""
import shutil
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from backend.app.database import get_db
from backend.app.models import User, KnowledgeSpace, Document, TextChunk
from backend.app.config import settings
from backend.app.dependencies import get_current_user
from backend.app.services import vector_service, keyword_service

router = APIRouter(prefix="/api/spaces", tags=["知识空间"])


# === Request / Response ===

class SpaceCreate(BaseModel):
    name: str
    description: Optional[str] = None


class SpaceUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


class SpaceResponse(BaseModel):
    id: int
    name: str
    description: Optional[str]
    doc_count: int = 0
    created_at: str
    updated_at: str

    class Config:
        from_attributes = True


def _space_to_response(space: KnowledgeSpace, doc_count: int = 0) -> dict:
    return {
        "id": space.id,
        "name": space.name,
        "description": space.description,
        "doc_count": doc_count,
        "created_at": space.created_at.isoformat() if space.created_at else "",
        "updated_at": space.updated_at.isoformat() if space.updated_at else "",
    }


# === 路由 ===

@router.get("", response_model=list[SpaceResponse])
def list_spaces(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """列出当前用户的所有知识空间"""
    spaces = (
        db.query(KnowledgeSpace)
        .filter(KnowledgeSpace.user_id == current_user.id)
        .order_by(KnowledgeSpace.updated_at.desc())
        .all()
    )
    result = []
    for s in spaces:
        doc_count = db.query(Document).filter(Document.space_id == s.id).count()
        result.append(_space_to_response(s, doc_count))
    return result


@router.post("", response_model=SpaceResponse)
def create_space(
    data: SpaceCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """创建知识空间"""
    if not data.name.strip():
        raise HTTPException(status_code=400, detail="名称不能为空")
    space = KnowledgeSpace(
        user_id=current_user.id,
        name=data.name.strip(),
        description=data.description,
    )
    db.add(space)
    db.commit()
    db.refresh(space)
    return _space_to_response(space, 0)


@router.get("/{space_id}", response_model=SpaceResponse)
def get_space(
    space_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """获取知识空间详情（必须属于当前用户）"""
    space = (
        db.query(KnowledgeSpace)
        .filter(
            KnowledgeSpace.id == space_id,
            KnowledgeSpace.user_id == current_user.id,
        )
        .first()
    )
    if not space:
        raise HTTPException(status_code=404, detail="知识空间不存在")
    doc_count = db.query(Document).filter(Document.space_id == space.id).count()
    return _space_to_response(space, doc_count)


@router.put("/{space_id}", response_model=SpaceResponse)
def update_space(
    space_id: int,
    data: SpaceUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """更新知识空间"""
    space = (
        db.query(KnowledgeSpace)
        .filter(
            KnowledgeSpace.id == space_id,
            KnowledgeSpace.user_id == current_user.id,
        )
        .first()
    )
    if not space:
        raise HTTPException(status_code=404, detail="知识空间不存在")
    if data.name is not None:
        if not data.name.strip():
            raise HTTPException(status_code=400, detail="名称不能为空")
        space.name = data.name.strip()
    if data.description is not None:
        space.description = data.description
    db.commit()
    db.refresh(space)
    doc_count = db.query(Document).filter(Document.space_id == space.id).count()
    return _space_to_response(space, doc_count)


@router.delete("/{space_id}")
def delete_space(
    space_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """删除知识空间（级联删除文档/对话/向量）"""
    space = (
        db.query(KnowledgeSpace)
        .filter(
            KnowledgeSpace.id == space_id,
            KnowledgeSpace.user_id == current_user.id,
        )
        .first()
    )
    if not space:
        raise HTTPException(status_code=404, detail="知识空间不存在")

    # 先收集所有 chunk id（ORM 级联删除后就查不到了），用于清理 FTS 索引
    chunk_ids = [
        cid for (cid,) in
        db.query(TextChunk.id)
        .join(Document, TextChunk.document_id == Document.id)
        .filter(Document.space_id == space_id)
        .all()
    ]

    db.delete(space)
    db.commit()

    # 清理 Chroma collection
    vector_service.delete_space_collection(current_user.id, space_id)
    # 清理 FTS 关键词索引
    if chunk_ids:
        keyword_service.remove_chunks_bulk(chunk_ids)
    # 清理上传的原始文件目录
    space_dir = settings.FILES_DIR / str(space_id)
    if space_dir.exists():
        shutil.rmtree(space_dir, ignore_errors=True)
    return {"ok": True}
