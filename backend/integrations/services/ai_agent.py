"""
AI Agent adapter — thin wrapper that delegates to the LangGraph ReAct agent.

Per-channel credentials JSONField:
  ai_enabled          bool    (default: False)
  ai_model            str     (claude-haiku-4-5-20251001 | claude-sonnet-4-6 | claude-opus-4-8)
  ai_context_messages int     (how many prior messages to include — default 10)
  ai_max_tokens       int     (default 1024)
  ai_handoff_keywords str     (comma-separated — fast-path trigger before entering the graph)
"""
import logging

from django.conf import settings

logger = logging.getLogger(__name__)


def get_ai_response(channel, conversation, incoming_text: str) -> tuple:
    """
    Returns (reply: str | None, should_handoff: bool).

    Fast-path exits (no graph invoked):
    - ai_enabled is False
    - ANTHROPIC_API_KEY not configured
    - Handoff keyword matched in incoming_text
    """
    creds = channel.credentials or {}

    if not creds.get('ai_enabled'):
        return None, False

    api_key = getattr(settings, 'ANTHROPIC_API_KEY', '').strip()
    if not api_key:
        logger.warning('[AI] ANTHROPIC_API_KEY not configured in .env')
        return None, False

    # Fast-path keyword handoff — no need to spin up the graph
    raw_keywords = creds.get('ai_handoff_keywords', '')
    handoff_keywords = [k.strip().lower() for k in raw_keywords.split(',') if k.strip()]
    if handoff_keywords and any(kw in incoming_text.lower() for kw in handoff_keywords):
        logger.info('[AI] Handoff keyword detected for channel %s', channel.id)
        return None, True

    from .agent_graph import run_agent
    return run_agent(channel, conversation, incoming_text)
