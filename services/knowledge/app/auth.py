from dataclasses import dataclass

import httpx
from fastapi import Header, HTTPException

from .config import get_settings


@dataclass(frozen=True)
class AuthenticatedUser:
    id: str
    email: str


async def require_user(authorization: str | None = Header(default=None)) -> AuthenticatedUser:
    settings = get_settings()
    if settings.auth_disabled:
        return AuthenticatedUser(id="local-development", email="local@development.invalid")
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Phiên đăng nhập không hợp lệ.")
    if not settings.supabase_url or not settings.supabase_publishable_key:
        raise HTTPException(status_code=503, detail="Dịch vụ xác thực chưa được cấu hình.")

    token = authorization.split(" ", 1)[1].strip()
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            response = await client.get(
                f"{settings.supabase_url.rstrip('/')}/auth/v1/user",
                headers={
                    "Authorization": f"Bearer {token}",
                    "apikey": settings.supabase_publishable_key,
                },
            )
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=503, detail="Không thể kiểm tra phiên đăng nhập.") from exc

    if response.status_code != 200:
        raise HTTPException(status_code=401, detail="Phiên đăng nhập đã hết hạn.")
    payload = response.json()
    return AuthenticatedUser(id=str(payload.get("id", "")), email=str(payload.get("email", "")))
