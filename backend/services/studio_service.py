"""AI Studio — text summarization, image generation & Sora 2 video generation."""
import os
import logging
import uuid
from pathlib import Path
from typing import List, Optional
from emergentintegrations.llm.chat import LlmChat, UserMessage
from emergentintegrations.llm.openai.image_generation import OpenAIImageGeneration
from emergentintegrations.llm.openai.video_generation import OpenAIVideoGeneration
from services.knowledge_retriever import retrieve, store
from services.settings_service import get_setting
from services.capability_manifest import with_capability
from services.provider_selector import pick_provider

logger = logging.getLogger(__name__)

EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")

SUMMARIZE_SYSTEM = (
    "You are a concise summarizer. Produce structured markdown with: "
    "1) TL;DR (2 sentences), 2) Key Points (5 bullets), 3) Action Items (if any). "
    "Preserve numeric facts and named entities. No fluff."
)


async def summarize_text(session_id: str, text: str, style: str = "default", user_id: Optional[str] = None) -> dict:
    """Summarize text. Returns {response, source, score} where source is 'kb'|'llm'."""
    kb_kind = f"studio_summarize:{style}"
    if await get_setting("kb_enabled", True):
        hit = await retrieve(kb_kind, text, user_id=user_id)
        if hit:
            return {"response": hit["response"], "source": "kb", "match": hit["match"], "score": hit["score"]}

    if await get_setting("kb_only_mode", False):
        from fastapi import HTTPException, status
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE,
                            "Knowledge-only mode is on and no cached answer was found.")

    system_prompt = SUMMARIZE_SYSTEM
    if style == "eli5":
        system_prompt += " Rewrite everything so a 12-year-old can understand it."
    elif style == "executive":
        system_prompt += " Tone: crisp executive brief. Focus on business impact."

    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=session_id,
        system_message=with_capability(system_prompt),
    )
    provider, model = await pick_provider(user_id)
    chat = chat.with_model(provider, model)
    resp = await chat.send_message(UserMessage(text=text))
    summary = resp if isinstance(resp, str) else getattr(resp, "content", str(resp))
    await store(kb_kind, text, summary, user_id=user_id, meta={"style": style, "provider": provider})
    return {"response": summary, "source": "llm", "provider": provider}


async def generate_image_bytes(prompt: str, quality: str = "low", n: int = 1) -> List[bytes]:
    """Generate images via GPT-Image-1 through Emergent proxy."""
    gen = OpenAIImageGeneration(api_key=EMERGENT_LLM_KEY)
    return await gen.generate_images(
        prompt=prompt,
        model="gpt-image-1",
        number_of_images=n,
        quality=quality,
    )



# ================= SORA 2 VIDEO GENERATION =================
VIDEO_OUT_DIR = Path(os.environ.get("BACKEND_UPLOADS_DIR", "/app/backend/uploads")) / "videos"
VIDEO_OUT_DIR.mkdir(parents=True, exist_ok=True)

# Allowed sizes / durations per Sora 2 spec
_ALLOWED_SIZES = {"1280x720", "1792x1024", "1024x1792", "1024x1024"}
_ALLOWED_DURATIONS = {4, 8, 12}


async def generate_video(prompt: str, model: str = "sora-2", size: str = "1280x720",
                         duration: int = 4) -> dict:
    """Generate a video via Sora 2 through the Emergent proxy. Returns
    ``{filename, path, url_rel, size, duration, model}``. Raises on failure so
    the caller can refund credits.
    """
    if size not in _ALLOWED_SIZES:
        raise ValueError(f"Unsupported size {size}; use one of {sorted(_ALLOWED_SIZES)}")
    if duration not in _ALLOWED_DURATIONS:
        raise ValueError(f"Unsupported duration {duration}; use one of {sorted(_ALLOWED_DURATIONS)}")
    if model not in ("sora-2", "sora-2-pro"):
        raise ValueError(f"Unsupported model {model}")

    # Sora 2 generation can take 2–5 min; the SDK blocks so we run it in a
    # worker thread to keep the FastAPI event loop responsive.
    import asyncio as _aio
    def _run():
        gen = OpenAIVideoGeneration(api_key=EMERGENT_LLM_KEY)
        max_wait = 900 if (duration == 12 or model == "sora-2-pro") else 600
        return gen.text_to_video(prompt=prompt, model=model, size=size,
                                 duration=duration, max_wait_time=max_wait)

    video_bytes = await _aio.to_thread(_run)
    if not video_bytes:
        raise RuntimeError("Sora returned empty video bytes")

    filename = f"sora_{uuid.uuid4().hex}.mp4"
    out = VIDEO_OUT_DIR / filename
    out.write_bytes(video_bytes)
    return {
        "filename": filename,
        "path": str(out),
        "url_rel": f"/api/media-static/videos/{filename}",
        "size": size,
        "duration": duration,
        "model": model,
        "bytes": len(video_bytes),
    }
