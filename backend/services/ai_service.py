"""Unified AI provider layer with failover Claude → OpenAI."""
import os
import logging
from typing import AsyncGenerator, List, Dict, Optional
from emergentintegrations.llm.chat import LlmChat, UserMessage, TextDelta, StreamDone

logger = logging.getLogger(__name__)

EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")
DEFAULT_PROVIDER = os.environ.get("DEFAULT_AI_PROVIDER", "anthropic")
DEFAULT_MODEL = os.environ.get("DEFAULT_AI_MODEL", "claude-haiku-4-5-20251001")
FALLBACK_PROVIDER = os.environ.get("FALLBACK_AI_PROVIDER", "openai")
FALLBACK_MODEL = os.environ.get("FALLBACK_AI_MODEL", "gpt-5-mini")

SYSTEM_PROMPT = (
    "You are IEMA.ai, a premium AI assistant. Be concise, helpful, and precise. "
    "Format responses in markdown when useful. Use fenced code blocks with language for code."
)


def _build_chat(session_id: str, provider: str, model: str, history: List[Dict]) -> LlmChat:
    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=session_id,
        system_message=SYSTEM_PROMPT,
    ).with_model(provider, model)
    return chat


async def stream_ai_response(
    session_id: str,
    user_message: str,
    history: List[Dict],
    model_override: Optional[str] = None,
) -> AsyncGenerator[Dict, None]:
    """
    Stream tokens from AI. Yields dicts: {"type": "meta"|"delta"|"done"|"error", ...}
    Automatically falls back Claude → OpenAI on error.
    """
    tried = []
    providers_to_try = [(DEFAULT_PROVIDER, model_override or DEFAULT_MODEL), (FALLBACK_PROVIDER, FALLBACK_MODEL)]

    for provider, model in providers_to_try:
        tried.append(f"{provider}:{model}")
        try:
            chat = _build_chat(session_id, provider, model, history)
            # Feed prior history so multi-turn works even for a fresh instance
            # emergentintegrations doesn't expose loading history, but same session_id preserves it server-side per instance.
            # We provide context via the last user message + a compact history prefix.
            prefix = _history_prefix(history)
            final_text = (prefix + "\n\n" + user_message) if prefix else user_message
            yield {"type": "meta", "provider": provider, "model": model}
            full_text = ""
            async for event in chat.stream_message(UserMessage(text=final_text)):
                if isinstance(event, TextDelta):
                    full_text += event.content
                    yield {"type": "delta", "content": event.content}
                elif isinstance(event, StreamDone):
                    break
            yield {"type": "done", "content": full_text, "provider": provider, "model": model}
            return
        except Exception as e:
            logger.exception(f"AI provider {provider} failed: {e}")
            yield {"type": "warn", "message": f"Provider {provider} failed, switching..."}
            continue

    yield {"type": "error", "message": f"All AI providers failed. Tried: {', '.join(tried)}"}


def _history_prefix(history: List[Dict], max_msgs: int = 10) -> str:
    """Build a compact conversation context prefix from recent messages."""
    if not history:
        return ""
    recent = history[-max_msgs:]
    lines = []
    for m in recent:
        role = "User" if m.get("role") == "user" else "Assistant"
        lines.append(f"{role}: {m.get('content', '')}")
    return "Previous conversation:\n" + "\n".join(lines)
