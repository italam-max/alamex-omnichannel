"""
AI Agent service — calls Claude with per-channel configuration.

Each Channel stores AI config in its credentials JSONField:
  ai_enabled          bool    (default: False)
  ai_api_key          str     (Anthropic API key — SECRET)
  ai_model            str     (claude-haiku-4-5-20251001 | claude-sonnet-4-6 | claude-opus-4-8)
  ai_system_prompt    str     (system instructions)
  ai_context_messages int     (how many prior messages to include — default 10)
  ai_max_tokens       int     (default 1024)
  ai_handoff_keywords str     (comma-separated — trigger human takeover)
"""
import logging
import anthropic

logger = logging.getLogger(__name__)

ROLE_MAP = {
    'customer': 'user',
    'ai':       'assistant',
    'agent':    'assistant',
}

DEFAULT_SYSTEM = (
    "Eres un asistente de atención al cliente amable y profesional. "
    "Responde siempre en el mismo idioma que el cliente. "
    "Si no sabes la respuesta, dilo con honestidad en lugar de inventar información."
)


def get_ai_response(channel, conversation, incoming_text: str) -> tuple:
    """
    Returns (reply: str | None, should_handoff: bool).

    reply is None when:
    - AI is disabled for this channel
    - No API key configured
    - Claude API call fails

    should_handoff is True when:
    - A handoff keyword is detected in the incoming message
    """
    creds = channel.credentials or {}

    if not creds.get('ai_enabled'):
        return None, False

    api_key = (creds.get('ai_api_key') or '').strip()
    if not api_key:
        logger.warning('[AI] Channel %s has ai_enabled=True but no ai_api_key', channel.id)
        return None, False

    # ── Handoff keyword detection ─────────────────────────────────
    raw_keywords = creds.get('ai_handoff_keywords', '')
    handoff_keywords = [k.strip().lower() for k in raw_keywords.split(',') if k.strip()]
    if handoff_keywords:
        text_lower = incoming_text.lower()
        if any(kw in text_lower for kw in handoff_keywords):
            logger.info('[AI] Handoff keyword detected for channel %s', channel.id)
            return None, True

    # ── Build message history ─────────────────────────────────────
    model         = creds.get('ai_model', 'claude-haiku-4-5-20251001')
    system_prompt = (creds.get('ai_system_prompt') or '').strip() or DEFAULT_SYSTEM
    context_count = max(1, min(50, int(creds.get('ai_context_messages') or 10)))
    max_tokens    = max(64, min(4096, int(creds.get('ai_max_tokens') or 1024)))

    history = list(
        conversation.messages
        .order_by('created_at')
        .values('role', 'content')
    )

    # Map to Anthropic role format, merge consecutive same-role messages
    anthropic_messages = []
    for msg in history[-context_count:]:
        role    = ROLE_MAP.get(msg['role'], 'user')
        content = msg['content']
        if anthropic_messages and anthropic_messages[-1]['role'] == role:
            anthropic_messages[-1]['content'] += '\n' + content
        else:
            anthropic_messages.append({'role': role, 'content': content})

    # Anthropic requires starting with a user message
    if not anthropic_messages or anthropic_messages[0]['role'] != 'user':
        anthropic_messages.insert(0, {'role': 'user', 'content': incoming_text})

    # Must end with a user message
    if anthropic_messages[-1]['role'] != 'user':
        anthropic_messages.append({'role': 'user', 'content': incoming_text})

    # ── Call Claude ───────────────────────────────────────────────
    try:
        client   = anthropic.Anthropic(api_key=api_key)
        response = client.messages.create(
            model=model,
            max_tokens=max_tokens,
            system=system_prompt,
            messages=anthropic_messages,
        )
        reply = response.content[0].text
        logger.info(
            '[AI] channel=%s model=%s input_tokens=%s output_tokens=%s',
            channel.id, model,
            response.usage.input_tokens,
            response.usage.output_tokens,
        )
        return reply, False

    except anthropic.AuthenticationError:
        logger.error('[AI] Invalid API key for channel %s', channel.id)
        return None, False
    except anthropic.RateLimitError:
        logger.warning('[AI] Rate limit hit for channel %s', channel.id)
        return None, False
    except Exception as exc:
        logger.error('[AI] Unexpected error for channel %s: %s', channel.id, exc)
        return None, False
