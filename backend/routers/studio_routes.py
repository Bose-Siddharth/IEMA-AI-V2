"""AI Studio routes — summarize + image generation."""
import os
import uuid
import logging
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from auth import get_current_user
from models import User
from services.studio_service import summarize_text, generate_image_bytes
from services.credit_service import has_credits, deduct_credits
from services.storage_service import upload_bytes, get_signed_url, is_configured
from services.data_lake import log_event

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/studio", tags=["studio"])

CREDIT_COST_SUMMARIZE = float(os.environ.get("CREDIT_COST_SUMMARIZE", "2"))
CREDIT_COST_IMAGE = float(os.environ.get("CREDIT_COST_IMAGE_GEN", "10"))


class SummarizeRequest(BaseModel):
    text: str = Field(min_length=20, max_length=40000)
    style: str = Field(default="default")  # default | eli5 | executive


class ImageGenRequest(BaseModel):
    prompt: str = Field(min_length=3, max_length=1000)
    quality: str = Field(default="low")  # low | medium | high
    n: int = Field(default=1, ge=1, le=4)


@router.post("/summarize")
async def studio_summarize(req: SummarizeRequest, user: User = Depends(get_current_user)):
    if not await has_credits(user.id, CREDIT_COST_SUMMARIZE):
        raise HTTPException(status.HTTP_402_PAYMENT_REQUIRED, "Insufficient credits")
    try:
        session_id = f"studio-sum-{user.id}-{uuid.uuid4().hex[:8]}"
        summary = await summarize_text(session_id, req.text, req.style)
        wallet = await deduct_credits(user.id, CREDIT_COST_SUMMARIZE, "ai_usage", "AI Studio summary")
        await log_event(
            "studio_summarize",
            user_id=user.id,
            payload={"style": req.style, "input_chars": len(req.text), "output_chars": len(summary)},
        )
        return {"summary": summary, "credits_used": CREDIT_COST_SUMMARIZE, "balance": wallet.total}
    except Exception as e:
        logger.exception("Summarize failed")
        raise HTTPException(500, f"Summarize failed: {str(e)[:200]}")


@router.post("/image")
async def studio_image(req: ImageGenRequest, user: User = Depends(get_current_user)):
    cost = CREDIT_COST_IMAGE * req.n
    if req.quality == "medium":
        cost *= 2
    elif req.quality == "high":
        cost *= 4
    if not await has_credits(user.id, cost):
        raise HTTPException(status.HTTP_402_PAYMENT_REQUIRED, f"Need {int(cost)} credits")
    if not is_configured():
        raise HTTPException(500, "Storage not configured")
    try:
        images = await generate_image_bytes(req.prompt, quality=req.quality, n=req.n)
        urls = []
        for img_bytes in images:
            key = await upload_bytes(
                img_bytes,
                f"studio-{uuid.uuid4().hex}.png",
                "image/png",
                folder=f"studio/{user.id}",
            )
            urls.append({
                "key": key,
                "url": get_signed_url(key, expires_in=60 * 60 * 24 * 7),
            })
        wallet = await deduct_credits(user.id, cost, "ai_usage", f"AI Studio image ({req.quality}x{req.n})")
        await log_event(
            "studio_image",
            user_id=user.id,
            payload={"prompt": req.prompt[:500], "quality": req.quality, "n": req.n},
        )
        return {"images": urls, "credits_used": cost, "balance": wallet.total}
    except Exception as e:
        logger.exception("Image gen failed")
        raise HTTPException(500, f"Image gen failed: {str(e)[:200]}")
