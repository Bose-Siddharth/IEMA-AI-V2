"""Career Intelligence routes."""
import os
import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from auth import get_current_user
from models import User
from services.career_service import search_jobs, get_or_generate_learning_path
from services.credit_service import has_credits, deduct_credits
from services.data_lake import log_event

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/career", tags=["career"])

CREDIT_JOB_SEARCH = float(os.environ.get("CREDIT_JOB_SEARCH", "0"))  # free
CREDIT_LEARNING_PATH = float(os.environ.get("CREDIT_LEARNING_PATH", "5"))


class JobSearchRequest(BaseModel):
    query: str = Field(min_length=2, max_length=120)
    location: str = Field(default="", max_length=120)
    page: int = Field(default=1, ge=1, le=10)


class LearningPathRequest(BaseModel):
    role: str = Field(min_length=2, max_length=120)
    skills: List[str] = Field(default_factory=list, max_length=20)


@router.post("/jobs")
async def jobs_search(req: JobSearchRequest, user: User = Depends(get_current_user)):
    data = await search_jobs(req.query, req.location, req.page)
    await log_event("career_job_search", user_id=user.id,
                    payload={"q": req.query, "loc": req.location, "count": data.get("count", 0),
                             "source": data.get("source")})
    return data


@router.post("/learning-path")
async def learning_path(req: LearningPathRequest, user: User = Depends(get_current_user)):
    # Charge only if a cache miss is expected. We charge upfront then hand off.
    # Cheap dodge: peek the cache by calling service — service returns cached=True flag.
    if CREDIT_LEARNING_PATH > 0 and not await has_credits(user.id, CREDIT_LEARNING_PATH):
        raise HTTPException(status.HTTP_402_PAYMENT_REQUIRED, "Insufficient credits")
    result = await get_or_generate_learning_path(req.role, req.skills)
    # Only deduct when we generated fresh
    if not result.get("cached", False) and CREDIT_LEARNING_PATH > 0:
        wallet = await deduct_credits(user.id, CREDIT_LEARNING_PATH, "ai_usage", "Learning path generation")
        result["credits_used"] = CREDIT_LEARNING_PATH
        result["balance"] = wallet.total
    else:
        result["credits_used"] = 0
    await log_event("career_learning_path", user_id=user.id,
                    payload={"role": req.role, "skills": req.skills, "cached": result.get("cached", False)})
    return result
