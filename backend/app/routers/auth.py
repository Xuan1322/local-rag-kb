"""认证 API — 注册 / 登录 / 当前用户"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel, field_validator
from typing import Optional

from backend.app.database import get_db
from backend.app.models import User
from backend.app.services.auth_service import hash_password, verify_password, create_token
from backend.app.dependencies import get_current_user

router = APIRouter(tags=["认证"])


class RegisterRequest(BaseModel):
    username: str
    password: str

    @field_validator("username")
    @classmethod
    def check_username(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("用户名不能为空")
        if len(v) < 2:
            raise ValueError("用户名至少 2 位")
        if len(v) > 50:
            raise ValueError("用户名最多 50 位")
        return v

    @field_validator("password")
    @classmethod
    def check_password(cls, v: str) -> str:
        if len(v) < 4:
            raise ValueError("密码至少 4 位")
        if len(v) > 100:
            raise ValueError("密码最多 100 位")
        return v


class LoginRequest(BaseModel):
    username: str
    password: str


@router.post("/api/auth/register")
def register(data: RegisterRequest, db: Session = Depends(get_db)):
    """注册新用户"""
    # 检查用户名是否已存在
    existing = db.query(User).filter(User.username == data.username).first()
    if existing:
        raise HTTPException(status_code=400, detail="用户名已被占用")

    user = User(
        username=data.username,
        password_hash=hash_password(data.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_token(user.id, user.username)
    return {
        "token": token,
        "user": {"id": user.id, "username": user.username},
    }


@router.post("/api/auth/login")
def login(data: LoginRequest, db: Session = Depends(get_db)):
    """登录"""
    user = db.query(User).filter(User.username == data.username.strip()).first()
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="用户名或密码错误")

    token = create_token(user.id, user.username)
    return {
        "token": token,
        "user": {"id": user.id, "username": user.username},
    }


@router.get("/api/auth/me")
def me(current_user: User = Depends(get_current_user)):
    """返回当前登录用户的基本信息"""
    return {
        "id": current_user.id,
        "username": current_user.username,
    }
