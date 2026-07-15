"""Payment routes: Stripe + Razorpay."""
import os
import hmac
import hashlib
import logging
from fastapi import APIRouter, HTTPException, Depends, Request
from bson import ObjectId
import razorpay
from emergentintegrations.payments.stripe.checkout import (
    StripeCheckout, CheckoutSessionRequest, CheckoutSessionResponse
)
from auth import get_current_user
from db import credit_packs_col, payment_transactions_col, now_iso
from models import (
    StripeCheckoutRequest, RazorpayOrderRequest, RazorpayVerifyRequest,
    PaymentTransaction, User
)
from services.credit_service import add_credits
from services.notification_service import notify

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/payments", tags=["payments"])

STRIPE_API_KEY = os.environ.get("STRIPE_API_KEY", "")
RAZORPAY_KEY_ID = os.environ.get("RAZORPAY_KEY_ID", "")
RAZORPAY_KEY_SECRET = os.environ.get("RAZORPAY_KEY_SECRET", "")

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


# ================= STRIPE =================
@router.post("/stripe/checkout")
async def create_stripe_checkout(req: StripeCheckoutRequest, request: Request, user: User = Depends(get_current_user)):
    pack = await _get_pack(req.pack_slug, "usd")
    host_url = str(request.base_url).rstrip("/")
    webhook_url = f"{host_url}/api/webhook/stripe"
    stripe_checkout = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=webhook_url)

    success_url = f"{req.origin_url}/payment-success?session_id={{CHECKOUT_SESSION_ID}}&provider=stripe"
    cancel_url = f"{req.origin_url}/billing"
    metadata = {
        "user_id": user.id,
        "pack_slug": req.pack_slug,
        "credits": str(pack["credits"] + pack.get("bonus_credits", 0)),
    }
    checkout_req = CheckoutSessionRequest(
        amount=float(pack["price"]),
        currency="usd",
        success_url=success_url,
        cancel_url=cancel_url,
        metadata=metadata,
    )
    session: CheckoutSessionResponse = await stripe_checkout.create_checkout_session(checkout_req)

    # Record transaction
    tx = PaymentTransaction(
        user_id=user.id,
        provider="stripe",
        pack_slug=req.pack_slug,
        amount=float(pack["price"]),
        currency="usd",
        credits=float(pack["credits"] + pack.get("bonus_credits", 0)),
        session_id=session.session_id,
        status="initiated",
        metadata=metadata,
    )
    await payment_transactions_col.insert_one(tx.to_mongo())
    return {"url": session.url, "session_id": session.session_id}


@router.get("/stripe/status/{session_id}")
async def stripe_status(session_id: str, request: Request, user: User = Depends(get_current_user)):
    host_url = str(request.base_url).rstrip("/")
    webhook_url = f"{host_url}/api/webhook/stripe"
    stripe_checkout = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=webhook_url)
    checkout_status = await stripe_checkout.get_checkout_status(session_id)

    tx_doc = await payment_transactions_col.find_one({"session_id": session_id, "user_id": user.id})
    if not tx_doc:
        raise HTTPException(404, "Transaction not found")
    tx = PaymentTransaction.from_mongo(tx_doc)

    updates = {
        "status": "paid" if checkout_status.payment_status == "paid" else ("expired" if checkout_status.status == "expired" else "pending"),
        "updated_at": now_iso(),
    }
    if checkout_status.payment_status == "paid" and not tx.credited:
        updates["credited"] = True
        await add_credits(user.id, tx.credits, bucket="purchased", kind="purchase", description=f"Purchase: {tx.pack_slug}", ref_id=session_id)
        await notify(user.id, "Purchase successful", f"{int(tx.credits)} credits added to your wallet.", kind="purchase")

    await payment_transactions_col.update_one({"session_id": session_id}, {"$set": updates})
    return {
        "status": updates["status"],
        "payment_status": checkout_status.payment_status,
        "amount": checkout_status.amount_total / 100 if checkout_status.amount_total else tx.amount,
        "currency": checkout_status.currency,
        "credits": tx.credits,
        "credited": updates.get("credited", tx.credited),
    }


@router.post("/webhook/stripe", include_in_schema=False)
async def stripe_webhook(request: Request):
    body = await request.body()
    host_url = str(request.base_url).rstrip("/")
    webhook_url = f"{host_url}/api/webhook/stripe"
    stripe_checkout = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=webhook_url)
    try:
        event = await stripe_checkout.handle_webhook(body, request.headers.get("Stripe-Signature"))
    except Exception as e:
        logger.exception(f"Stripe webhook error: {e}")
        raise HTTPException(400, "Invalid webhook")

    if event.payment_status == "paid":
        tx_doc = await payment_transactions_col.find_one({"session_id": event.session_id})
        if tx_doc:
            tx = PaymentTransaction.from_mongo(tx_doc)
            if not tx.credited:
                await add_credits(tx.user_id, tx.credits, bucket="purchased", kind="purchase", description=f"Purchase: {tx.pack_slug}", ref_id=event.session_id)
                await payment_transactions_col.update_one(
                    {"session_id": event.session_id},
                    {"$set": {"status": "paid", "credited": True, "updated_at": now_iso()}},
                )
                await notify(tx.user_id, "Purchase successful", f"{int(tx.credits)} credits added to your wallet.", kind="purchase")
    return {"ok": True}


# ================= RAZORPAY =================
@router.post("/razorpay/order")
async def create_razorpay_order(req: RazorpayOrderRequest, user: User = Depends(get_current_user)):
    if not _razorpay_client:
        raise HTTPException(501, "Razorpay not configured")
    pack = await _get_pack(req.pack_slug, "inr")
    amount_paise = int(float(pack["price"]) * 100)
    order = _razorpay_client.order.create({
        "amount": amount_paise,
        "currency": "INR",
        "payment_capture": 1,
        "notes": {"user_id": user.id, "pack_slug": req.pack_slug},
    })
    tx = PaymentTransaction(
        user_id=user.id,
        provider="razorpay",
        pack_slug=req.pack_slug,
        amount=float(pack["price"]),
        currency="inr",
        credits=float(pack["credits"] + pack.get("bonus_credits", 0)),
        order_id=order["id"],
        status="initiated",
        metadata={"user_id": user.id, "pack_slug": req.pack_slug},
    )
    await payment_transactions_col.insert_one(tx.to_mongo())
    return {
        "order_id": order["id"],
        "amount": amount_paise,
        "currency": "INR",
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
