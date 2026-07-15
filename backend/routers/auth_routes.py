"""Authentication routes."""
import os
import httpx
import logging
from fastapi import APIRouter, HTTPException, Depends, Request, status
from bson import ObjectId
from models import (
    RegisterRequest, LoginRequest, RefreshRequest, TokenPair, UserPublic,
    OAuthCodeRequest, UserUpdateRequest, User
)
from auth import (
    hash_password, verify_password, create_access_token, create_refresh_token,
    decode_token, store_session, get_current_user
)
from db import users_col, sessions_col, now_iso
from services.credit_service import get_or_create_wallet

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["auth"])

GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET", "")


def _user_to_public(user: User) -> UserPublic:
    return UserPublic(
        id=user.id,
        email=user.email,
        name=user.name,
        role=user.role,
        avatar=user.avatar,
        provider=user.provider,
        email_verified=user.email_verified,
        theme=user.theme,
        created_at=user.created_at,
    )


@router.post("/register", response_model=dict)
async def register(req: RegisterRequest, request: Request):
    existing = await users_col.find_one({"email": req.email.lower()})
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")
    user = User(
        email=req.email.lower(),
        name=req.name,
        password_hash=hash_password(req.password),
        provider="email",
        email_verified=False,
        last_login_at=now_iso(),
    )
    data = user.to_mongo()
    result = await users_col.insert_one(data)
    user.id = str(result.inserted_id)
    await get_or_create_wallet(user.id)

    access = create_access_token(user.id, user.role)
    refresh = create_refresh_token(user.id)
    ua = request.headers.get("user-agent", "")
    ip = request.client.host if request.client else ""
    await store_session(user.id, refresh, ua, ip)
    return {
        "user": _user_to_public(user).model_dump(),
        "tokens": TokenPair(access_token=access, refresh_token=refresh).model_dump(),
    }


@router.post("/login", response_model=dict)
async def login(req: LoginRequest, request: Request):
    doc = await users_col.find_one({"email": req.email.lower()})
    if not doc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid credentials")
    user = User.from_mongo(doc)
    if not user.password_hash or not verify_password(req.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid credentials")
    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Account disabled")

    await users_col.update_one({"_id": ObjectId(user.id)}, {"$set": {"last_login_at": now_iso()}})
    await get_or_create_wallet(user.id)

    access = create_access_token(user.id, user.role)
    refresh = create_refresh_token(user.id)
    ua = request.headers.get("user-agent", "")
    ip = request.client.host if request.client else ""
    await store_session(user.id, refresh, ua, ip)
    return {
        "user": _user_to_public(user).model_dump(),
        "tokens": TokenPair(access_token=access, refresh_token=refresh).model_dump(),
    }


@router.post("/refresh", response_model=TokenPair)
async def refresh_token(req: RefreshRequest):
    try:
        payload = decode_token(req.refresh_token)
        if payload.get("type") != "refresh":
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token type")
        user_id = payload["sub"]
    except Exception:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid refresh token")

    doc = await users_col.find_one({"_id": ObjectId(user_id)})
    if not doc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found")
    user = User.from_mongo(doc)
    access = create_access_token(user.id, user.role)
    new_refresh = create_refresh_token(user.id)
    return TokenPair(access_token=access, refresh_token=new_refresh)


@router.post("/logout")
async def logout(req: RefreshRequest):
    await sessions_col.delete_one({"refresh_token": req.refresh_token})
    return {"ok": True}


@router.get("/me", response_model=UserPublic)
async def me(user: User = Depends(get_current_user)):
    return _user_to_public(user)


@router.patch("/me", response_model=UserPublic)
async def update_me(req: UserUpdateRequest, user: User = Depends(get_current_user)):
    updates = {k: v for k, v in req.model_dump(exclude_none=True).items()}
    updates["updated_at"] = now_iso()
    await users_col.update_one({"_id": ObjectId(user.id)}, {"$set": updates})
    doc = await users_col.find_one({"_id": ObjectId(user.id)})
    return _user_to_public(User.from_mongo(doc))


@router.delete("/me")
async def delete_me(user: User = Depends(get_current_user)):
    """Delete account (Play/App Store compliant)."""
    await users_col.delete_one({"_id": ObjectId(user.id)})
    await sessions_col.delete_many({"user_id": user.id})
    return {"ok": True, "message": "Account permanently deleted"}


@router.post("/google", response_model=dict)
async def google_oauth(req: OAuthCodeRequest, request: Request):
    """Exchange Google OAuth authorization code for user session."""
    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
        raise HTTPException(status.HTTP_501_NOT_IMPLEMENTED, "Google OAuth not configured")
    async with httpx.AsyncClient(timeout=15) as http:
        # Exchange code for token
        token_res = await http.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": req.code,
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "redirect_uri": req.redirect_uri,
                "grant_type": "authorization_code",
            },
        )
        if token_res.status_code != 200:
            logger.error(f"Google token exchange failed: {token_res.text}")
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "OAuth token exchange failed")
        tokens = token_res.json()
        access_token = tokens.get("access_token")
        # Get user info
        info_res = await http.get(
            "https://www.googleapis.com/oauth2/v3/userinfo",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        if info_res.status_code != 200:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Failed to fetch user info")
        info = info_res.json()

    email = (info.get("email") or "").lower()
    if not email:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No email in Google account")
    name = info.get("name") or email.split("@")[0]
    avatar = info.get("picture")
    provider_id = info.get("sub")

    doc = await users_col.find_one({"email": email})
    if doc:
        user = User.from_mongo(doc)
        await users_col.update_one({"_id": ObjectId(user.id)}, {"$set": {"last_login_at": now_iso(), "avatar": avatar or user.avatar}})
    else:
        user = User(
            email=email, name=name, avatar=avatar,
            provider="google", provider_id=provider_id, email_verified=True,
            last_login_at=now_iso(),
        )
        data = user.to_mongo()
        result = await users_col.insert_one(data)
        user.id = str(result.inserted_id)
        await get_or_create_wallet(user.id)

    access = create_access_token(user.id, user.role)
    refresh = create_refresh_token(user.id)
    await store_session(user.id, refresh, request.headers.get("user-agent", ""), request.client.host if request.client else "")
    return {
        "user": _user_to_public(user).model_dump(),
        "tokens": TokenPair(access_token=access, refresh_token=refresh).model_dump(),
    }
