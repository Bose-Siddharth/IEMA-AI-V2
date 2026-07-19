"""Authentication routes."""
import os
import secrets
import httpx
import jwt as pyjwt
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends, Request, status
from middleware.security import limiter
from bson import ObjectId
from pydantic import BaseModel, EmailStr, Field
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
GITHUB_CLIENT_ID = os.environ.get("GITHUB_CLIENT_ID", "")
GITHUB_CLIENT_SECRET = os.environ.get("GITHUB_CLIENT_SECRET", "")
LINKEDIN_CLIENT_ID = os.environ.get("LINKEDIN_CLIENT_ID", "")
LINKEDIN_CLIENT_SECRET = os.environ.get("LINKEDIN_CLIENT_SECRET", "")
APP_URL = os.environ.get("APP_URL", "")

_ms_jwks_by_issuer: dict = {}
_apple_jwks = None


def _get_ms_jwks_for_issuer(issuer: str):
    """Get JWKS client for a specific Microsoft issuer (org tenant or MSA)."""
    if issuer not in _ms_jwks_by_issuer:
        # Convert issuer to JWKS URL: https://login.microsoftonline.com/{tenant}/v2.0 → /{tenant}/discovery/v2.0/keys
        base = issuer.rstrip("/").removesuffix("/v2.0")
        jwks_url = f"{base}/discovery/v2.0/keys"
        _ms_jwks_by_issuer[issuer] = pyjwt.PyJWKClient(jwks_url)
    return _ms_jwks_by_issuer[issuer]


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
@limiter.limit("5/hour")
async def register(req: RegisterRequest, request: Request):
    existing = await users_col.find_one({"email": req.email.lower()})
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")
    user = User(
        email=req.email.lower(),
        name=req.name,
        password_hash=hash_password(req.password),
        provider="email",
        plan="free",
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
@limiter.limit("10/minute")
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
    # Validate ai_provider
    if updates.get("ai_provider") not in (None, "iema", "claude", "openai"):
        raise HTTPException(400, "ai_provider must be one of: iema, claude, openai")
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


# ---- Multi-account linking -------------------------------------------------
LINK_ALLOWED_PROVIDERS = {"google", "microsoft", "apple", "github", "linkedin"}


@router.get("/me/linked")
async def list_linked(user: User = Depends(get_current_user)):
    doc = await users_col.find_one({"_id": ObjectId(user.id)}, {"linked_accounts": 1, "provider": 1, "provider_id": 1, "email": 1})
    linked = list((doc or {}).get("linked_accounts", []))
    # Ensure primary provider is represented
    if (doc or {}).get("provider") and doc.get("provider") != "email":
        primary_present = any(l.get("provider") == doc["provider"] for l in linked)
        if not primary_present:
            linked.insert(0, {
                "provider": doc["provider"],
                "provider_id": doc.get("provider_id"),
                "email": doc.get("email"),
                "primary": True,
            })
    return {"linked": linked, "primary_email": (doc or {}).get("email")}


class LinkAccountRequest(BaseModel):
    provider: str
    provider_id: str
    email: Optional[str] = None


@router.post("/me/link")
async def link_account(req: LinkAccountRequest, user: User = Depends(get_current_user)):
    if req.provider not in LINK_ALLOWED_PROVIDERS:
        raise HTTPException(400, f"Unsupported provider `{req.provider}`")
    # Reject if already claimed by another user
    other = await users_col.find_one({
        "$or": [
            {"linked_accounts": {"$elemMatch": {"provider": req.provider, "provider_id": req.provider_id}}},
            {"provider": req.provider, "provider_id": req.provider_id, "_id": {"$ne": ObjectId(user.id)}},
        ]
    })
    if other and str(other["_id"]) != user.id:
        raise HTTPException(409, "This account is already linked to another IEMA user")

    entry = {
        "provider": req.provider,
        "provider_id": req.provider_id,
        "email": (req.email or "").lower() or None,
        "connected_at": now_iso(),
    }
    # Upsert into array — replace existing (same provider+id)
    await users_col.update_one(
        {"_id": ObjectId(user.id)},
        {"$pull": {"linked_accounts": {"provider": req.provider, "provider_id": req.provider_id}}},
    )
    await users_col.update_one(
        {"_id": ObjectId(user.id)},
        {"$push": {"linked_accounts": entry}, "$set": {"updated_at": now_iso()}},
    )
    return {"ok": True, "linked": entry}


@router.delete("/me/link/{provider}")
async def unlink_account(provider: str, user: User = Depends(get_current_user)):
    if provider not in LINK_ALLOWED_PROVIDERS:
        raise HTTPException(400, "Unsupported provider")
    doc = await users_col.find_one({"_id": ObjectId(user.id)}, {"provider": 1, "password_hash": 1, "linked_accounts": 1})
    if not doc:
        raise HTTPException(404, "User not found")
    is_primary = (doc.get("provider") == provider)
    linked = doc.get("linked_accounts") or []
    remaining = [l for l in linked if l.get("provider") != provider]
    remaining_providers = {l.get("provider") for l in remaining}
    if is_primary:
        remaining_providers.add(doc.get("provider"))  # primary still counts unless we're unlinking it
        remaining_providers.discard(provider)
    has_password = bool(doc.get("password_hash"))
    if not has_password and not remaining_providers:
        raise HTTPException(400, "Set a password before disconnecting your only sign-in method")

    update = {"$set": {"linked_accounts": remaining, "updated_at": now_iso()}}
    if is_primary:
        # Promote another linked provider (or fall back to email)
        promote = next(iter(remaining), None)
        if promote:
            update["$set"]["provider"] = promote["provider"]
            update["$set"]["provider_id"] = promote.get("provider_id")
        else:
            update["$set"]["provider"] = "email"
            update["$set"]["provider_id"] = None
    await users_col.update_one({"_id": ObjectId(user.id)}, update)
    return {"ok": True}




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


# ================= GITHUB OAUTH =================
@router.post("/github", response_model=dict)
async def github_oauth(req: OAuthCodeRequest, request: Request):
    if not GITHUB_CLIENT_ID or not GITHUB_CLIENT_SECRET:
        raise HTTPException(status.HTTP_501_NOT_IMPLEMENTED, "GitHub OAuth not configured")
    async with httpx.AsyncClient(timeout=15) as http:
        token_res = await http.post(
            "https://github.com/login/oauth/access_token",
            data={
                "client_id": GITHUB_CLIENT_ID,
                "client_secret": GITHUB_CLIENT_SECRET,
                "code": req.code,
                "redirect_uri": req.redirect_uri,
            },
            headers={"Accept": "application/json"},
        )
        if token_res.status_code != 200:
            logger.error(f"GitHub token exchange failed: {token_res.text}")
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "GitHub token exchange failed")
        tokens = token_res.json()
        access_token = (tokens.get("access_token") or "").strip()
        if not access_token:
            err = tokens.get("error_description") or tokens.get("error") or "No access token from GitHub"
            logger.error(f"GitHub token exchange returned no access_token: {tokens}")
            raise HTTPException(status.HTTP_400_BAD_REQUEST, err)
        # GitHub OAuth Apps historically prefer `token <token>` over `Bearer`.
        # X-GitHub-Api-Version pins a stable schema.
        h = {
            "Authorization": f"token {access_token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "iema-ai",
        }
        user_res = await http.get("https://api.github.com/user", headers=h)
        if user_res.status_code != 200:
            logger.error(f"GitHub /user failed status={user_res.status_code} body={user_res.text[:300]}")
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"GitHub /user error ({user_res.status_code}): {user_res.text[:120]}")
        info = user_res.json()
        # Emails may need a separate call if primary is private
        email = (info.get("email") or "").lower()
        if not email:
            emails_res = await http.get("https://api.github.com/user/emails", headers=h)
            if emails_res.status_code == 200:
                for e in emails_res.json():
                    if e.get("primary") and e.get("verified"):
                        email = (e.get("email") or "").lower(); break
            else:
                logger.error(f"GitHub /user/emails failed status={emails_res.status_code} body={emails_res.text[:300]}")
        if not email:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "No verified email on your GitHub account")
    name = info.get("name") or info.get("login") or email.split("@")[0]
    avatar = info.get("avatar_url")
    provider_id = str(info.get("id"))

    doc = await users_col.find_one({"email": email})
    if doc:
        user = User.from_mongo(doc)
        await users_col.update_one({"_id": ObjectId(user.id)}, {"$set": {"last_login_at": now_iso(), "avatar": avatar or user.avatar}})
    else:
        user = User(email=email, name=name, avatar=avatar, provider="github",
                    provider_id=provider_id, email_verified=True, last_login_at=now_iso(), plan="free")
        result = await users_col.insert_one(user.to_mongo())
        user.id = str(result.inserted_id)
        await get_or_create_wallet(user.id)

    access = create_access_token(user.id, user.role)
    refresh = create_refresh_token(user.id)
    await store_session(user.id, refresh, request.headers.get("user-agent", ""), request.client.host if request.client else "")
    return {"user": _user_to_public(user).model_dump(),
            "tokens": TokenPair(access_token=access, refresh_token=refresh).model_dump()}


# ================= LINKEDIN OAUTH (OpenID Connect) =================
@router.post("/linkedin", response_model=dict)
async def linkedin_oauth(req: OAuthCodeRequest, request: Request):
    if not LINKEDIN_CLIENT_ID or not LINKEDIN_CLIENT_SECRET:
        raise HTTPException(status.HTTP_501_NOT_IMPLEMENTED, "LinkedIn OAuth not configured")
    async with httpx.AsyncClient(timeout=15) as http:
        token_res = await http.post(
            "https://www.linkedin.com/oauth/v2/accessToken",
            data={
                "grant_type": "authorization_code",
                "code": req.code,
                "redirect_uri": req.redirect_uri,
                "client_id": LINKEDIN_CLIENT_ID,
                "client_secret": LINKEDIN_CLIENT_SECRET,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        if token_res.status_code != 200:
            logger.error(f"LinkedIn token exchange failed: {token_res.text}")
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "LinkedIn token exchange failed")
        tokens = token_res.json()
        access_token = tokens.get("access_token")
        # OIDC userinfo endpoint (requires openid + profile + email scopes)
        info_res = await http.get(
            "https://api.linkedin.com/v2/userinfo",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        if info_res.status_code != 200:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"LinkedIn userinfo failed: {info_res.text[:200]}")
        info = info_res.json()

    email = (info.get("email") or "").lower()
    if not email:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No email in LinkedIn profile")
    name = info.get("name") or f"{info.get('given_name','')} {info.get('family_name','')}".strip() or email.split("@")[0]
    avatar = info.get("picture")
    provider_id = info.get("sub")

    doc = await users_col.find_one({"email": email})
    if doc:
        user = User.from_mongo(doc)
        await users_col.update_one({"_id": ObjectId(user.id)}, {"$set": {"last_login_at": now_iso(), "avatar": avatar or user.avatar}})
    else:
        user = User(email=email, name=name, avatar=avatar, provider="linkedin",
                    provider_id=provider_id, email_verified=True, last_login_at=now_iso(), plan="free")
        result = await users_col.insert_one(user.to_mongo())
        user.id = str(result.inserted_id)
        await get_or_create_wallet(user.id)

    access = create_access_token(user.id, user.role)
    refresh = create_refresh_token(user.id)
    await store_session(user.id, refresh, request.headers.get("user-agent", ""), request.client.host if request.client else "")
    return {"user": _user_to_public(user).model_dump(),
            "tokens": TokenPair(access_token=access, refresh_token=refresh).model_dump()}



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


# ================= PASSWORD RESET (2FA via email OTP + short-lived token) =================
# Flow:
#   1. POST /auth/forgot-password { email }  → emails a 6-digit OTP.
#   2. POST /auth/verify-reset-otp { email, otp } → returns short-lived
#      reset_token (server-side JWT-less random token, 10-min TTL).
#   3. POST /auth/reset-password { token, new_password } → sets new password.
#
# The OTP step is the second factor. We deliberately do NOT include the
# reset link in the email anymore — the OTP has to be manually re-entered on
# the same device that initiated the flow, blocking email-based token theft.
@router.post("/forgot-password")
async def forgot_password(req: ForgotPasswordRequest):
    """Always returns ok=true to avoid user enumeration. Emails a 6-digit OTP
    if the user exists and has a password-based account."""
    doc = await users_col.find_one({"email": req.email.lower()})
    if doc and doc.get("password_hash"):
        user = User.from_mongo(doc)
        # Invalidate any prior unused OTPs for this user
        await reset_tokens_col.update_many(
            {"user_id": user.id, "used": False, "kind": "reset_otp"},
            {"$set": {"used": True}},
        )
        otp = f"{secrets.randbelow(1_000_000):06d}"
        otp_hash = hash_password(otp)   # bcrypt — resists offline brute force
        expires_at = (now_utc() + timedelta(minutes=10)).isoformat()
        await reset_tokens_col.insert_one({
            "user_id": user.id,
            "email": user.email,
            "otp_hash": otp_hash,
            "attempts": 0,
            "kind": "reset_otp",
            "expires_at": expires_at,
            "used": False,
            "created_at": now_iso(),
        })
        try:
            from services.email_service import reset_otp_template
            body = reset_otp_template(user.name, otp)
        except Exception:
            body = f"Your IEMA.ai password reset code is: {otp}\nThis code expires in 10 minutes."
        await send_email(user.email, "Your IEMA.ai reset code", body)
    return {"ok": True}


class VerifyResetOtpRequest(BaseModel):
    email: EmailStr
    otp: str = Field(min_length=4, max_length=8)


@router.post("/verify-reset-otp")
async def verify_reset_otp(req: VerifyResetOtpRequest):
    doc = await reset_tokens_col.find_one({
        "email": req.email.lower(),
        "kind": "reset_otp",
        "used": False,
    })
    if not doc:
        raise HTTPException(400, "Invalid or expired code")
    if doc.get("attempts", 0) >= 5:
        await reset_tokens_col.update_one({"_id": doc["_id"]}, {"$set": {"used": True}})
        raise HTTPException(429, "Too many failed attempts. Request a new code.")
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

    if not verify_password(req.otp, doc["otp_hash"]):
        await reset_tokens_col.update_one({"_id": doc["_id"]}, {"$inc": {"attempts": 1}})
        raise HTTPException(400, "Invalid code")

    # OTP passed → issue a short-lived token the reset step will consume.
    reset_token = secrets.token_urlsafe(32)
    expires_at = (now_utc() + timedelta(minutes=10)).isoformat()
    await reset_tokens_col.update_one(
        {"_id": doc["_id"]},
        {"$set": {
            "used": True,
            "token": reset_token,
            "token_expires_at": expires_at,
            "verified_at": now_iso(),
        }},
    )
    # Insert a companion row keyed by the reset token so /reset-password can
    # find it without needing the email again.
    await reset_tokens_col.insert_one({
        "user_id": doc["user_id"],
        "token": reset_token,
        "kind": "reset_token",
        "expires_at": expires_at,
        "used": False,
        "created_at": now_iso(),
    })
    return {"ok": True, "reset_token": reset_token}


@router.post("/reset-password")
async def reset_password(req: ResetPasswordRequest):
    doc = await reset_tokens_col.find_one({
        "token": req.token,
        "used": False,
        # Accept both the legacy link-only tokens and the new OTP-issued ones
        "$or": [{"kind": "reset_token"}, {"kind": {"$exists": False}}],
    })
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
    """Public config so frontend knows which OAuth providers are enabled.

    Microsoft and Facebook are intentionally excluded from the public config
    for this launch — Microsoft's OAuth flow has not been stabilised against
    our reverse proxy, and we do not have Facebook Login approved in Meta
    for Developers. Re-add them here once each is verified end-to-end.
    """
    return {
        "google": {"enabled": bool(GOOGLE_CLIENT_ID), "client_id": GOOGLE_CLIENT_ID},
        "apple": {"enabled": bool(APPLE_CLIENT_ID), "client_id": APPLE_CLIENT_ID},
        "github": {"enabled": bool(GITHUB_CLIENT_ID), "client_id": GITHUB_CLIENT_ID},
        "linkedin": {"enabled": bool(LINKEDIN_CLIENT_ID), "client_id": LINKEDIN_CLIENT_ID},
    }


# ================= MICROSOFT ID TOKEN VERIFY (from MSAL popup) =================
@router.post("/microsoft-verify", response_model=dict)
async def microsoft_id_token_verify(req: IdTokenRequest, request: Request):
    """Verify a Microsoft ID token obtained via MSAL popup. No redirect_uri needed for verification."""
    if not MICROSOFT_CLIENT_ID:
        raise HTTPException(status.HTTP_501_NOT_IMPLEMENTED, "Microsoft OAuth not configured")
    try:
        # Extract issuer from the unverified token so we hit the correct JWKS
        # (personal MSA tokens are issued from tenant 9188040d-... not /common)
        unverified = pyjwt.decode(req.id_token, options={"verify_signature": False})
        issuer = unverified.get("iss") or ""
        if not issuer.startswith("https://login.microsoftonline.com/") and not issuer.startswith("https://sts.windows.net/"):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Unexpected token issuer")
        jwks = _get_ms_jwks_for_issuer(issuer)
        signing_key = jwks.get_signing_key_from_jwt(req.id_token)
        payload = pyjwt.decode(
            req.id_token,
            signing_key.key,
            algorithms=["RS256"],
            audience=MICROSOFT_CLIENT_ID,
            issuer=issuer,
        )
    except HTTPException:
        raise
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
