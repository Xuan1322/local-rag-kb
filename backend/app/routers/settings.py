"""设置 API — 每用户独立配置"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from backend.app.database import get_db
from backend.app.models import User, AppSettings
from backend.app.dependencies import get_current_user

router = APIRouter(tags=["设置"])


class SettingsUpdate(BaseModel):
    llm_api_key: Optional[str] = None
    llm_base_url: Optional[str] = None
    llm_model: Optional[str] = None
    temperature: Optional[int] = None
    similarity_threshold: Optional[int] = None
    top_k: Optional[int] = None
    has_onboarded: Optional[bool] = None


def _get_or_create(db: Session, user_id: int) -> AppSettings:
    s = db.query(AppSettings).filter(AppSettings.user_id == user_id).first()
    if not s:
        s = AppSettings(user_id=user_id)
        db.add(s)
        db.commit()
        db.refresh(s)
    return s


@router.get("/api/settings")
def get_settings(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    s = _get_or_create(db, current_user.id)
    return {
        "has_onboarded": s.has_onboarded,
        "llm_api_key": "******" if s.llm_api_key else "",
        "llm_base_url": s.llm_base_url or "",
        "llm_model": s.llm_model or "",
        "temperature": s.temperature,
        "similarity_threshold": s.similarity_threshold,
        "top_k": s.top_k,
        "llm_configured": bool(s.llm_api_key and s.llm_base_url and s.llm_model),
    }


@router.put("/api/settings")
def update_settings(
    data: SettingsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    s = _get_or_create(db, current_user.id)

    if data.llm_api_key is not None:
        if data.llm_api_key != "******":
            s.llm_api_key = data.llm_api_key or None
    if data.llm_base_url is not None:
        s.llm_base_url = data.llm_base_url.strip() or None
    if data.llm_model is not None:
        s.llm_model = data.llm_model.strip() or None
    if data.temperature is not None:
        s.temperature = max(0, min(10, data.temperature))
    if data.similarity_threshold is not None:
        s.similarity_threshold = max(0, min(100, data.similarity_threshold))
    if data.top_k is not None:
        s.top_k = max(1, min(20, data.top_k))
    if data.has_onboarded is not None:
        s.has_onboarded = data.has_onboarded

    db.commit()
    db.refresh(s)
    return get_settings(db, current_user)


# === LLM 连通性测试 ===

class TestLLMRequest(BaseModel):
    llm_api_key: Optional[str] = None
    llm_base_url: Optional[str] = None
    llm_model: Optional[str] = None


@router.post("/api/settings/test-llm")
async def test_llm(
    data: TestLLMRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    import httpx
    from backend.app.services.llm_service import LLMConfig

    saved = _get_or_create(db, current_user.id)

    # 表单留空或为掩码（******）时，回退到已保存的配置，避免“已配置却测试失败”
    def _pick(form_val, saved_val):
        v = (form_val or "").strip()
        if not v or v == "******":
            return (saved_val or "").strip()
        return v

    api_key = _pick(data.llm_api_key, saved.llm_api_key)
    base_url = _pick(data.llm_base_url, saved.llm_base_url).rstrip("/")
    model = _pick(data.llm_model, saved.llm_model)

    if not all([api_key, base_url, model]):
        return {"ok": False, "message": "请填写 API Key / Base URL / 模型名"}

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                f"{base_url}/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": model,
                    "messages": [{"role": "user", "content": "hi"}],
                    "max_tokens": 5,
                    "temperature": 0,
                    "stream": False,
                },
            )

            if resp.status_code == 200:
                try:
                    body = resp.json()
                    text = body["choices"][0]["message"]["content"]
                    return {
                        "ok": True,
                        "message": f"连接成功！模型返回：\"{text.strip()}\"",
                    }
                except Exception:
                    return {"ok": True, "message": "连接成功！（无法解析响应内容）"}

            detail = ""
            try:
                body = resp.json()
                detail = body.get("error", {}).get("message", resp.text[:200])
            except Exception:
                detail = resp.text[:200]

            hint = ""
            if resp.status_code == 401:
                hint = " — API Key 无效"
            elif resp.status_code == 404:
                hint = " — Base URL 可能不对"
            elif resp.status_code == 400:
                hint = " — 模型名可能不对"
            elif resp.status_code == 429:
                hint = " — 请求过于频繁（429 限流）"
            elif resp.status_code >= 500:
                hint = " — 服务端错误"

            return {
                "ok": False,
                "status_code": resp.status_code,
                "message": f"请求失败 ({resp.status_code}): {detail}{hint}",
            }

    except httpx.ConnectTimeout:
        return {"ok": False, "message": "连接超时 — 检查 Base URL 是否能访问"}
    except httpx.ConnectError:
        return {"ok": False, "message": "无法连接 — 检查 Base URL 是否正确、网络是否可达"}
    except Exception as e:
        return {"ok": False, "message": f"未知错误: {type(e).__name__}: {str(e)[:200]}"}
