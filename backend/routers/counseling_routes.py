"""Counseling routes — Career, Psychology, Academic AI counselor."""
import os
import logging
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from auth import get_current_user
from models import User
from services.counseling_service import counsel
from services.credit_service import has_credits, deduct_credits
from services.data_lake import log_event

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/counseling", tags=["counseling"])

CREDIT_COST_COUNSEL = float(os.environ.get("CREDIT_COST_COUNSEL", "3"))

MODES = ("career", "psychology", "academic")


class CounselRequest(BaseModel):
    mode: str = Field(default="career")
    message: str = Field(min_length=3, max_length=4000)


@router.post("")
async def counsel_route(req: CounselRequest, user: User = Depends(get_current_user)):
    if req.mode not in MODES:
        raise HTTPException(400, f"mode must be one of {MODES}")
    if not await has_credits(user.id, CREDIT_COST_COUNSEL):
        raise HTTPException(status.HTTP_402_PAYMENT_REQUIRED, "Insufficient credits")
    try:
        result = await counsel(req.mode, req.message, user_id=user.id)
    except Exception as e:
        logger.exception("Counsel failed")
        raise HTTPException(500, f"Counsel failed: {str(e)[:200]}")

    credits = 0.0 if result["source"] == "kb" else CREDIT_COST_COUNSEL
    balance = None
    if credits > 0:
        wallet = await deduct_credits(user.id, credits, "ai_usage", f"Counseling ({req.mode})")
        balance = wallet.total
    await log_event(
        f"counseling_{req.mode}", user_id=user.id,
        payload={"chars_in": len(req.message), "chars_out": len(result["response"]),
                 "source": result["source"], "score": result.get("score")},
    )
    return {
        "response": result["response"],
        "mode": req.mode,
        "source": result["source"],
        "score": result.get("score"),
        "match": result.get("match"),
        "credits_used": credits,
        "balance": balance,
        "disclaimer": _disclaimer(req.mode),
    }


def _disclaimer(mode: str) -> str:
    if mode == "psychology":
        return ("This is AI-generated wellness guidance, not a substitute for a licensed therapist. "
                "If you're in crisis, call iCall India: 9152987821.")
    if mode == "academic":
        return "Guidance is informational; verify against your official curriculum."
    return "Career suggestions are based on general market patterns; validate against current listings."
