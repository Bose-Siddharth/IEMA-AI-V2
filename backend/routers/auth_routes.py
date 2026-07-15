"""Authentication routes."""
import os
import secrets
import httpx
import jwt as pyjwt
import logging
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, HTTPException, Depends, Request, status
from bson import ObjectId
from models import (
    RegisterRequest, LoginRequest, RefreshRequest, TokenPair, UserPublic,
    OAuthCodeRequest, GoogleIdTokenRequest, IdTokenRequest, UserUpdateRequest, User,
    ForgotPasswordRequest, ResetPasswordRequest, VerifyEmailRequest
)
from auth import (
    hash_password, verify_password, create_access_token, create_refresh_token,
    decode_token, store_session, get_current_user
)
from db import users_col, sessions_col, db, now_iso, now_utc
from services.credit_service import get_or_create_wallet
from services.email_service import send_email, verify_email_template, reset_password_template, welcome_template

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["auth"])

GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET", "")
MICROSOFT_CLIENT_ID = os.environ.get("MICROSOFT_CLIENT_ID", "")
MICROSOFT_CLIENT_SECRET = os.environ.get("MICROSOFT_CLIENT_SECRET", "")
APPLE_CLIENT_ID = os.environ.get("APPLE_CLIENT_ID", "")
APP_URL = os.environ.get("APP_URL", "")

_ms_jwks = None
_apple_jwks = None


def _get_ms_jwks():
    global _ms_jwks
    if _ms_jwks is None:
        _ms_jwks = pyjwt.PyJWKClient("https://login.microsoftonline.com/common/discovery/v2.0/keys")
    return _ms_jwks


def _get_apple_jwks():
    global _apple_jwks
    if _apple_jwks is None:
        _apple_jwks = pyjwt.PyJWKClient("https://appleid.apple.com/auth/keys")
    return _apple_jwks

email_codes_col = db["email_codes"]
reset_tokens_col = db["reset_tokens"]


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
    # Fire welcome email (dev-mode logs to console if RESEND key missing)
    import asyncio
    asyncio.create_task(send_email(user.email, "Welcome to IEMA.ai", welcome_template(user.name)))
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


@router.post("/google-verify", response_model=dict)
async def google_id_token_verify(req: GoogleIdTokenRequest, request: Request):
    """Verify a Google-issued ID token (from Google Identity Services). No redirect_uri needed."""
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(status.HTTP_501_NOT_IMPLEMENTED, "Google OAuth not configured")
    async with httpx.AsyncClient(timeout=10) as http:
        r = await http.get("https://oauth2.googleapis.com/tokeninfo", params={"id_token": req.credential})
        if r.status_code != 200:
            logger.error(f"Google tokeninfo failed: {r.text}")
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid Google token")
        info = r.json()
    if info.get("aud") != GOOGLE_CLIENT_ID:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Token audience mismatch")
    if info.get("iss") not in ("accounts.google.com", "https://accounts.google.com"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Token issuer invalid")

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



# ================= MICROSOFT OAUTH =================
@router.post("/microsoft", response_model=dict)
async def microsoft_oauth(req: OAuthCodeRequest, request: Request):
    if not MICROSOFT_CLIENT_ID or not MICROSOFT_CLIENT_SECRET:
        raise HTTPException(status.HTTP_501_NOT_IMPLEMENTED, "Microsoft OAuth not configured")
    async with httpx.AsyncClient(timeout=15) as http:
        token_res = await http.post(
            "https://login.microsoftonline.com/common/oauth2/v2.0/token",
            data={
                "client_id": MICROSOFT_CLIENT_ID,
                "client_secret": MICROSOFT_CLIENT_SECRET,
                "code": req.code,
                "redirect_uri": req.redirect_uri,
                "grant_type": "authorization_code",
                "scope": "openid email profile User.Read",
            },
        )
        if token_res.status_code != 200:
            logger.error(f"Microsoft token exchange failed: {token_res.text}")
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "OAuth token exchange failed")
        tokens = token_res.json()
        info_res = await http.get(
            "https://graph.microsoft.com/v1.0/me",
            headers={"Authorization": f"Bearer {tokens.get('access_token')}"},
        )
        if info_res.status_code != 200:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Failed to fetch user info")
        info = info_res.json()

    email = (info.get("mail") or info.get("userPrincipalName") or "").lower()
    if not email:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No email in Microsoft account")
    name = info.get("displayName") or email.split("@")[0]
    provider_id = info.get("id")

    doc = await users_col.find_one({"email": email})
    if doc:
        user = User.from_mongo(doc)
        await users_col.update_one({"_id": ObjectId(user.id)}, {"$set": {"last_login_at": now_iso()}})
    else:
        user = User(
            email=email, name=name, provider="microsoft", provider_id=provider_id,
            email_verified=True, last_login_at=now_iso(),
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


# ================= EMAIL VERIFICATION =================
@router.post("/send-verify-email")
async def send_verify_email(user: User = Depends(get_current_user)):
    if user.email_verified:
        return {"ok": True, "already_verified": True}
    code = f"{secrets.randbelow(1000000):06d}"
    expires_at = (now_utc() + timedelta(minutes=15)).isoformat()
    await email_codes_col.update_one(
        {"user_id": user.id, "purpose": "verify"},
        {"$set": {"user_id": user.id, "purpose": "verify", "code": code, "expires_at": expires_at, "created_at": now_iso()}},
        upsert=True,
    )
    await send_email(user.email, "Your IEMA.ai verification code", verify_email_template(user.name, code))
    return {"ok": True, "sent": True}


@router.post("/verify-email")
async def verify_email(req: VerifyEmailRequest, user: User = Depends(get_current_user)):
    doc = await email_codes_col.find_one({"user_id": user.id, "purpose": "verify"})
    if not doc:
        raise HTTPException(400, "No pending code. Please request a new one.")
    try:
        expires = datetime.fromisoformat(doc["expires_at"])
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)
        if now_utc() > expires:
            raise HTTPException(400, "Code expired. Request a new one.")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(400, "Invalid code state")
    if req.code.strip() != doc["code"]:
        raise HTTPException(400, "Invalid code")
    await users_col.update_one({"_id": ObjectId(user.id)}, {"$set": {"email_verified": True, "updated_at": now_iso()}})
    await email_codes_col.delete_one({"user_id": user.id, "purpose": "verify"})
    return {"ok": True, "verified": True}


# ================= PASSWORD RESET =================
@router.post("/forgot-password")
async def forgot_password(req: ForgotPasswordRequest):
    """Always returns ok=true to avoid user enumeration. Sends email only if user exists."""
    doc = await users_col.find_one({"email": req.email.lower()})
    if doc and doc.get("password_hash"):
        user = User.from_mongo(doc)
        # Invalidate any prior unused tokens for this user
        await reset_tokens_col.update_many({"user_id": user.id, "used": False}, {"$set": {"used": True}})
        token = secrets.token_urlsafe(32)
        expires_at = (now_utc() + timedelta(hours=1)).isoformat()
        await reset_tokens_col.insert_one({
            "user_id": user.id,
            "token": token,
            "expires_at": expires_at,
            "used": False,
            "created_at": now_iso(),
        })
        reset_url = f"{APP_URL}/reset-password?token={token}"
        await send_email(user.email, "Reset your IEMA.ai password", reset_password_template(user.name, reset_url))
    return {"ok": True}


@router.post("/reset-password")
async def reset_password(req: ResetPasswordRequest):
    doc = await reset_tokens_col.find_one({"token": req.token, "used": False})
    if not doc:
        raise HTTPException(400, "Invalid or already-used token")
    try:
        expires = datetime.fromisoformat(doc["expires_at"])
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)
        if now_utc() > expires:
            raise HTTPException(400, "Token expired. Request a new one.")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(400, "Invalid token state")

    new_hash = hash_password(req.new_password)
    await users_col.update_one({"_id": ObjectId(doc["user_id"])}, {"$set": {"password_hash": new_hash, "updated_at": now_iso()}})
    await reset_tokens_col.update_one({"_id": doc["_id"]}, {"$set": {"used": True}})
    # Invalidate all sessions
    await sessions_col.delete_many({"user_id": doc["user_id"]})
    return {"ok": True}


@router.get("/oauth-config")
async def oauth_config():
    """Public config so frontend knows which OAuth providers are enabled."""
    return {
        "google": {"enabled": bool(GOOGLE_CLIENT_ID), "client_id": GOOGLE_CLIENT_ID},
        "microsoft": {"enabled": bool(MICROSOFT_CLIENT_ID), "client_id": MICROSOFT_CLIENT_ID},
        "apple": {"enabled": bool(APPLE_CLIENT_ID), "client_id": APPLE_CLIENT_ID},
        "facebook": {"enabled": False, "reason": "not configured"},
    }


# ================= MICROSOFT ID TOKEN VERIFY (from MSAL popup) =================
@router.post("/microsoft-verify", response_model=dict)
async def microsoft_id_token_verify(req: IdTokenRequest, request: Request):
    """Verify a Microsoft ID token obtained via MSAL popup. No redirect_uri needed for verification."""
    if not MICROSOFT_CLIENT_ID:
        raise HTTPException(status.HTTP_501_NOT_IMPLEMENTED, "Microsoft OAuth not configured")
    try:
        jwks = _get_ms_jwks()
        signing_key = jwks.get_signing_key_from_jwt(req.id_token)
        # Microsoft uses per-tenant issuers, so we don't force iss check but verify signature + aud
        payload = pyjwt.decode(
            req.id_token,
            signing_key.key,
            algorithms=["RS256"],
            audience=MICROSOFT_CLIENT_ID,
            options={"verify_iss": False},  # Multi-tenant apps have per-tenant iss
        )
    except Exception as e:
        logger.exception(f"Microsoft id_token verify failed: {e}")
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid Microsoft token")

    email = (payload.get("email") or payload.get("preferred_username") or "").lower()
    if not email:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No email in Microsoft account")
    name = payload.get("name") or email.split("@")[0]
    provider_id = payload.get("oid") or payload.get("sub")

    doc = await users_col.find_one({"email": email})
    if doc:
        user = User.from_mongo(doc)
        await users_col.update_one({"_id": ObjectId(user.id)}, {"$set": {"last_login_at": now_iso()}})
    else:
        user = User(
            email=email, name=name, provider="microsoft", provider_id=provider_id,
            email_verified=True, last_login_at=now_iso(),
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


# ================= APPLE ID TOKEN VERIFY (from Sign in with Apple JS) =================
@router.post("/apple", response_model=dict)
async def apple_id_token_verify(req: IdTokenRequest, request: Request):
    """Verify an Apple ID token obtained via Sign in with Apple JS."""
    if not APPLE_CLIENT_ID:
        raise HTTPException(status.HTTP_501_NOT_IMPLEMENTED, "Apple Sign-In not configured")
    try:
        jwks = _get_apple_jwks()
        signing_key = jwks.get_signing_key_from_jwt(req.id_token)
        payload = pyjwt.decode(
            req.id_token,
            signing_key.key,
            algorithms=["RS256"],
            audience=APPLE_CLIENT_ID,
            issuer="https://appleid.apple.com",
        )
    except Exception as e:
        logger.exception(f"Apple id_token verify failed: {e}")
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid Apple token")

    email = (payload.get("email") or "").lower()
    if not email:
        # Apple can hide email — use sub as pseudo-email
        sub = payload.get("sub")
        if not sub:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "No identity in Apple token")
        email = f"apple_{sub}@privaterelay.appleid.com"
    name = payload.get("name") or email.split("@")[0]
    provider_id = payload.get("sub")

    doc = await users_col.find_one({"$or": [{"email": email}, {"provider_id": provider_id, "provider": "apple"}]})
    if doc:
        user = User.from_mongo(doc)
        await users_col.update_one({"_id": ObjectId(user.id)}, {"$set": {"last_login_at": now_iso()}})
    else:
        user = User(
            email=email, name=name, provider="apple", provider_id=provider_id,
            email_verified=True, last_login_at=now_iso(),
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
