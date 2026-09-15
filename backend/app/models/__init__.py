"""
所有 SQLAlchemy 模型统一在这里定义
"""
from datetime import datetime
from sqlalchemy import (
    Column, Integer, String, Text, DateTime, ForeignKey, JSON, Index, Boolean
)
from sqlalchemy.orm import relationship
from backend.app.database import Base


class User(Base):
    """用户"""
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String(50), unique=True, nullable=False, index=True)
    password_hash = Column(String(128), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # 关系
    spaces = relationship("KnowledgeSpace", back_populates="user", cascade="all, delete-orphan")
    settings = relationship("AppSettings", back_populates="user", uselist=False, cascade="all, delete-orphan")


class KnowledgeSpace(Base):
    """知识空间"""
    __tablename__ = "knowledge_spaces"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    user = relationship("User", back_populates="spaces")
    documents = relationship("Document", back_populates="space", cascade="all, delete-orphan")
    conversations = relationship("Conversation", back_populates="space", cascade="all, delete-orphan")


class Document(Base):
    """文档"""
    __tablename__ = "documents"

    id = Column(Integer, primary_key=True, autoincrement=True)
    space_id = Column(Integer, ForeignKey("knowledge_spaces.id", ondelete="CASCADE"), nullable=False, index=True)
    filename = Column(String(255), nullable=False)
    file_path = Column(String(500), nullable=False)
    file_size = Column(Integer, nullable=False, default=0)
    mime_type = Column(String(50), nullable=True)
    status = Column(String(20), nullable=False, default="pending")
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    space = relationship("KnowledgeSpace", back_populates="documents")
    chunks = relationship("TextChunk", back_populates="document", cascade="all, delete-orphan")


class TextChunk(Base):
    """文本分块（向量存在 ChromaDB，这里存分块元信息）"""
    __tablename__ = "text_chunks"

    id = Column(Integer, primary_key=True, autoincrement=True)
    document_id = Column(Integer, ForeignKey("documents.id", ondelete="CASCADE"), nullable=False, index=True)
    chunk_index = Column(Integer, nullable=False)
    content = Column(Text, nullable=False)
    start_offset = Column(Integer, nullable=False, default=0)
    end_offset = Column(Integer, nullable=False, default=0)
    chunk_metadata = Column("metadata_json", JSON, nullable=True)

    document = relationship("Document", back_populates="chunks")

    __table_args__ = (
        Index("ix_text_chunks_document", "document_id"),
    )


class Conversation(Base):
    """对话历史"""
    __tablename__ = "conversations"

    id = Column(Integer, primary_key=True, autoincrement=True)
    space_id = Column(Integer, ForeignKey("knowledge_spaces.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String(200), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    space = relationship("KnowledgeSpace", back_populates="conversations")
    messages = relationship("Message", back_populates="conversation", cascade="all, delete-orphan")


class Message(Base):
    """消息"""
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, autoincrement=True)
    conversation_id = Column(Integer, ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False, index=True)
    role = Column(String(20), nullable=False)
    content = Column(Text, nullable=False)
    references = Column(JSON, nullable=True)
    # 该条消息携带的附件（仅 user 消息）：[{"id": 文档id, "filename": 文件名}]
    attachments = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    conversation = relationship("Conversation", back_populates="messages")

    __table_args__ = (
        Index("ix_messages_conversation", "conversation_id"),
    )


class AppSettings(Base):
    """应用设置（每用户一行）"""
    __tablename__ = "app_settings"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    has_onboarded = Column(Boolean, nullable=False, default=False)
    llm_api_key = Column(String(500), nullable=True)
    llm_base_url = Column(String(500), nullable=True)
    llm_model = Column(String(100), nullable=True)
    temperature = Column(Integer, nullable=False, default=7)
    similarity_threshold = Column(Integer, nullable=False, default=15)
    top_k = Column(Integer, nullable=False, default=5)
    updated_at = Column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    user = relationship("User", back_populates="settings")
