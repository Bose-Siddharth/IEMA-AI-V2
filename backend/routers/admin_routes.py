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
