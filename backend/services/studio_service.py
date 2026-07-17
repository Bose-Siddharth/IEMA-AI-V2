"""AI Studio — text summarization and image generation via GPT-Image-1."""
import os
import logging
from typing import List, Optional
from emergentintegrations.llm.chat import LlmChat, UserMessage
from emergentintegrations.llm.openai.image_generation import OpenAIImageGeneration
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
