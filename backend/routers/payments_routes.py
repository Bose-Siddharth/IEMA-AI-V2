"""Payment routes: Razorpay (converts USD packs → INR at checkout) + IAP.

Stripe was removed per product decision — all web payments go through Razorpay,
all mobile subscriptions through App Store / Play Store IAP.
"""
import os
import logging
from fastapi import APIRouter, HTTPException, Depends, Request
from typing import Optional
from pydantic import BaseModel
from bson import ObjectId
import razorpay
from auth import get_current_user
from db import credit_packs_col, payment_transactions_col, now_iso
from models import (
    RazorpayOrderRequest, RazorpayVerifyRequest,
    PaymentTransaction, User
)
from services.credit_service import add_credits
from services.notification_service import notify

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/payments", tags=["payments"])

RAZORPAY_KEY_ID = os.environ.get("RAZORPAY_KEY_ID", "")
RAZORPAY_KEY_SECRET = os.environ.get("RAZORPAY_KEY_SECRET", "")
# Fixed USD→INR conversion rate — kept slightly padded so we never undercharge.
USD_TO_INR = float(os.environ.get("USD_TO_INR_RATE", "85"))

_razorpay_client = razorpay.Client(auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET)) if RAZORPAY_KEY_ID else None


async def _get_pack(slug: str, currency: str = None) -> dict:
    query = {"slug": slug, "is_visible": True}
    if currency:
        query["currency"] = currency
    doc = await credit_packs_col.find_one(query)
    if not doc:
        raise HTTPException(404, "Pack not found")
    doc["id"] = str(doc.pop("_id"))
    return doc


# ================= STRIPE (removed) =================
# All Stripe endpoints were removed. Razorpay is the sole web payment provider.


# ================= RAZORPAY =================
@router.post("/razorpay/order")
async def create_razorpay_order(req: RazorpayOrderRequest, user: User = Depends(get_current_user)):
    if not _razorpay_client:
        raise HTTPException(501, "Razorpay not configured")
    # Fetch USD-priced pack, convert to INR paise for Razorpay (India merchant).
    pack = await _get_pack(req.pack_slug, "usd")
    price_usd = float(pack["price"])
    amount_paise = int(round(price_usd * USD_TO_INR * 100))
    order = _razorpay_client.order.create({
        "amount": amount_paise,
        "currency": "INR",
        "payment_capture": 1,
        "notes": {"user_id": user.id, "pack_slug": req.pack_slug, "usd_price": str(price_usd)},
    })
    tx = PaymentTransaction(
        user_id=user.id,
        provider="razorpay",
        pack_slug=req.pack_slug,
        amount=price_usd,
        currency="usd",
        credits=float(pack["credits"] + pack.get("bonus_credits", 0)),
        order_id=order["id"],
        status="initiated",
        metadata={"user_id": user.id, "pack_slug": req.pack_slug,
                  "amount_paise": amount_paise, "fx_rate": USD_TO_INR},
    )
    await payment_transactions_col.insert_one(tx.to_mongo())
    return {
        "order_id": order["id"],
        "amount": amount_paise,
        "currency": "INR",
        "usd_price": price_usd,
        "key_id": RAZORPAY_KEY_ID,
        "credits": tx.credits,
        "pack": pack,
    }


@router.post("/razorpay/verify")
async def verify_razorpay(req: RazorpayVerifyRequest, user: User = Depends(get_current_user)):
    if not _razorpay_client:
        raise HTTPException(501, "Razorpay not configured")
    try:
        _razorpay_client.utility.verify_payment_signature({
            "razorpay_order_id": req.razorpay_order_id,
            "razorpay_payment_id": req.razorpay_payment_id,
            "razorpay_signature": req.razorpay_signature,
        })
    except Exception:
        raise HTTPException(400, "Invalid signature")

    tx_doc = await payment_transactions_col.find_one({"order_id": req.razorpay_order_id, "user_id": user.id})
    if not tx_doc:
        raise HTTPException(404, "Transaction not found")
    tx = PaymentTransaction.from_mongo(tx_doc)

    if not tx.credited:
        await add_credits(user.id, tx.credits, bucket="purchased", kind="purchase", description=f"Purchase: {tx.pack_slug}", ref_id=req.razorpay_payment_id)
        await payment_transactions_col.update_one(
            {"order_id": req.razorpay_order_id},
            {"$set": {"status": "paid", "credited": True, "payment_id": req.razorpay_payment_id, "updated_at": now_iso()}},
        )
        await notify(user.id, "Purchase successful", f"{int(tx.credits)} credits added to your wallet.", kind="purchase")
    return {"ok": True, "credits": tx.credits}


@router.get("/history")
async def payment_history(user: User = Depends(get_current_user), limit: int = 50):
    cursor = payment_transactions_col.find({"user_id": user.id}).sort("created_at", -1).limit(limit)
    items = []
    async for doc in cursor:
        doc["id"] = str(doc.pop("_id"))
        items.append(doc)
    return {"items": items}


# ==================== Razorpay Subscriptions ====================
from services.payments_service import (
    create_subscription as _rzp_create_sub,
    handle_razorpay_webhook as _rzp_webhook,
    verify_apple_receipt as _apple_verify,
    verify_google_receipt as _google_verify,
    DEFAULT_PRODUCT_MAP,
)


@router.post("/subscribe/{plan_id}")
async def create_subscription(plan_id: str, user: User = Depends(get_current_user)):
    try:
        return await _rzp_create_sub(user.id, plan_id)
    except Exception as e:
        raise HTTPException(400, str(e)[:200])


@router.post("/webhook/razorpay-subscription", include_in_schema=False)
async def razorpay_sub_webhook(request: Request):
    signature = request.headers.get("x-razorpay-signature", "")
    body = await request.body()
    res = await _rzp_webhook(body, signature)
    if not res.get("ok"):
        raise HTTPException(400, res.get("reason", "webhook failed"))
    return res


# ==================== Mobile IAP receipts ====================
class AppleReceiptRequest(BaseModel):
    receipt: str  # base64
    product_map: Optional[dict] = None


class GoogleReceiptRequest(BaseModel):
    product_id: str
    purchase_token: str
    is_subscription: bool = True
    product_map: Optional[dict] = None


@router.post("/iap/apple/verify")
async def iap_apple_verify(req: AppleReceiptRequest, user: User = Depends(get_current_user)):
    mapping = req.product_map or DEFAULT_PRODUCT_MAP
    res = await _apple_verify(user.id, req.receipt, mapping)
    if not res.get("ok"):
        raise HTTPException(400, res.get("error", "invalid receipt"))
    return res


@router.post("/iap/google/verify")
async def iap_google_verify(req: GoogleReceiptRequest, user: User = Depends(get_current_user)):
    mapping = req.product_map or DEFAULT_PRODUCT_MAP
    res = await _google_verify(user.id, req.product_id, req.purchase_token, req.is_subscription, mapping)
    if not res.get("ok"):
        raise HTTPException(400, res.get("error", "invalid receipt"))
    return res

