"""认证服务：密码哈希 + JWT"""
import hashlib
from datetime import datetime, timedelta, timezone
import jwt
from backend.app.config import settings


def hash_password(password: str, salt: str = None) -> str:
    """SHA256(salt + password)，salt 存前 16 字符"""
    if salt is None:
        import secrets
        salt = secrets.token_hex(8)
    h = hashlib.sha256((salt + password).encode("utf-8")).hexdigest()
    return f"{salt}:{h}"


def verify_password(password: str, stored: str) -> bool:
    """验证密码"""
    try:
        salt, h = stored.split(":", 1)
    except ValueError:
        return False
    return hash_password(password, salt) == stored


def create_token(user_id: int, username: str) -> str:
    """生成 JWT"""
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "username": username,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(hours=settings.JWT_EXPIRE_HOURS)).timestamp()),
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm="HS256")


def decode_token(token: str) -> dict | None:
    """解析 JWT，失败返回 None"""
    try:
        return jwt.decode(token, settings.JWT_SECRET, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None
