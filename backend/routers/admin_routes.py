"""Admin routes."""
from fastapi import APIRouter, Depends, HTTPException, Query
from bson import ObjectId
from auth import require_admin
from db import (
    users_col, wallets_col, payment_transactions_col, transactions_col,
    ai_requests_col, conversations_col, messages_col, credit_packs_col, now_iso
)
from models import User, AdminUpdateWalletRequest
from services.credit_service import add_credits, get_or_create_wallet
from services.notification_service import notify

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/stats")
async def stats(admin: User = Depends(require_admin)):
    total_users = await users_col.count_documents({})
    total_convs = await conversations_col.count_documents({})
    total_msgs = await messages_col.count_documents({})
    total_ai = await ai_requests_col.count_documents({})
    total_paid_docs = await payment_transactions_col.aggregate([
        {"$match": {"status": "paid"}},
        {"$group": {"_id": "$currency", "total": {"$sum": "$amount"}, "count": {"$sum": 1}}},
    ]).to_list(10)
    return {
        "total_users": total_users,
        "total_conversations": total_convs,
        "total_messages": total_msgs,
        "total_ai_requests": total_ai,
        "revenue": total_paid_docs,
    }


@router.get("/users")
async def list_users(admin: User = Depends(require_admin), limit: int = 100, skip: int = 0, q: str = ""):
    query = {}
    if q:
        query = {"$or": [{"email": {"$regex": q, "$options": "i"}}, {"name": {"$regex": q, "$options": "i"}}]}
    cursor = users_col.find(query).sort("created_at", -1).skip(skip).limit(limit)
    items = []
    async for doc in cursor:
        doc["id"] = str(doc.pop("_id"))
        doc.pop("password_hash", None)
        # attach wallet total
        wallet = await wallets_col.find_one({"user_id": doc["id"]})
        if wallet:
            doc["credits_total"] = (
                wallet.get("welcome_credits", 0) + wallet.get("daily_credits", 0)
                + wallet.get("bonus_credits", 0) + wallet.get("referral_credits", 0)
                + wallet.get("promotional_credits", 0) + wallet.get("purchased_credits", 0)
            )
        else:
            doc["credits_total"] = 0
        items.append(doc)
    total = await users_col.count_documents(query)
    return {"items": items, "total": total}


@router.post("/users/{user_id}/toggle-active")
async def toggle_active(user_id: str, admin: User = Depends(require_admin)):
    doc = await users_col.find_one({"_id": ObjectId(user_id)})
    if not doc:
        raise HTTPException(404, "Not found")
    new_active = not doc.get("is_active", True)
    await users_col.update_one({"_id": ObjectId(user_id)}, {"$set": {"is_active": new_active, "updated_at": now_iso()}})
    return {"is_active": new_active}


@router.post("/users/{user_id}/promote")
async def toggle_admin(user_id: str, admin: User = Depends(require_admin)):
    doc = await users_col.find_one({"_id": ObjectId(user_id)})
    if not doc:
        raise HTTPException(404, "Not found")
    new_role = "admin" if doc.get("role") != "admin" else "user"
    await users_col.update_one({"_id": ObjectId(user_id)}, {"$set": {"role": new_role, "updated_at": now_iso()}})
    return {"role": new_role}


@router.post("/wallet/adjust")
async def adjust_wallet(req: AdminUpdateWalletRequest, admin: User = Depends(require_admin)):
    await get_or_create_wallet(req.user_id)
    await add_credits(req.user_id, req.amount, bucket=req.bucket, kind="admin_adjust", description=req.description)
    await notify(req.user_id, "Wallet updated by admin", f"{int(req.amount)} {req.bucket} credits added.", kind="info")
    return {"ok": True}


@router.get("/transactions")
async def list_transactions(admin: User = Depends(require_admin), limit: int = 100, skip: int = 0):
    cursor = payment_transactions_col.find({}).sort("created_at", -1).skip(skip).limit(limit)
    items = []
    async for doc in cursor:
        doc["id"] = str(doc.pop("_id"))
        items.append(doc)
    return {"items": items}


# --- Knowledge Bank + Settings ---
from services.knowledge_retriever import stats as kb_stats_fn
from services.settings_service import all_settings, set_setting, get_setting, DEFAULTS
from pydantic import BaseModel


class SettingUpdate(BaseModel):
    key: str
    value: object


@router.get("/kb/stats")
async def kb_stats(admin: User = Depends(require_admin)):
    return await kb_stats_fn()


@router.get("/settings")
async def get_settings(admin: User = Depends(require_admin)):
    current = await all_settings()
    return {"settings": current, "defaults": DEFAULTS}


@router.post("/settings")
async def update_setting(req: SettingUpdate, admin: User = Depends(require_admin)):
    if req.key not in DEFAULTS:
        raise HTTPException(400, f"Unknown setting `{req.key}`")
    # Type-coerce
    default_val = DEFAULTS[req.key]
    value = req.value
    if isinstance(default_val, bool):
        value = bool(value)
    elif isinstance(default_val, float):
        try:
            value = float(value)
        except Exception:
            raise HTTPException(400, "value must be a number")
        if req.key == "kb_similarity_threshold" and not (0.0 <= value <= 1.0):
            raise HTTPException(400, "threshold must be between 0 and 1")
    prev = await get_setting(req.key)
    await set_setting(req.key, value)
    from services.data_lake import log_event
    await log_event(
        "admin_setting_updated",
        user_id=admin.id,
        payload={"key": req.key, "prev": prev, "new": value},
    )
    return {"ok": True, "key": req.key, "value": value}
