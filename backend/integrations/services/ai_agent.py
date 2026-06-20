"""
AI Agent service — calls Claude using the platform master API key.

Per-channel credentials JSONField (still used):
  ai_enabled          bool    (default: False)
  ai_model            str     (claude-haiku-4-5-20251001 | claude-sonnet-4-6 | claude-opus-4-8)
  ai_context_messages int     (how many prior messages to include — default 10)
  ai_max_tokens       int     (default 1024)
  ai_handoff_keywords str     (comma-separated — trigger human takeover)

Global:
  - Master Anthropic key: settings.ANTHROPIC_API_KEY (in .env — never in DB)
  - Credit tracking: billing.CreditAccount / CreditTransaction
  - System prompt: built from knowledge.AIConfig + KnowledgeDoc records
"""
import logging
from decimal import Decimal

from django.conf import settings

import anthropic

logger = logging.getLogger(__name__)

ROLE_MAP = {
    'customer': 'user',
    'ai':       'assistant',
    'agent':    'assistant',
}

FALLBACK_SYSTEM = (
    "Eres un asistente de atención al cliente amable y profesional. "
    "Responde siempre en el mismo idioma que el cliente. "
    "Si no sabes la respuesta, dilo con honestidad en lugar de inventar información."
)


# ── System prompt from Knowledge ──────────────────────────────────

def _build_system_prompt() -> str:
    try:
        from knowledge.models import AIConfig, KnowledgeDoc
        config = AIConfig.get_solo()
        docs = list(KnowledgeDoc.objects.filter(is_active=True).order_by('order', 'created_at'))
    except Exception:
        return FALLBACK_SYSTEM

    parts = []

    if config.identity_line:
        parts.append(config.identity_line)
    if config.agent_description:
        parts.append(config.agent_description)
    if config.overview:
        parts.append("=== BUSINESS OVERVIEW ===\n" + config.overview)
    if docs:
        doc_blocks = "\n\n".join(f"--- {d.title} ---\n{d.content}" for d in docs)
        parts.append("=== KNOWLEDGE BASE ===\n" + doc_blocks)

    rules = [r for r in (config.behavior_rules or []) if r and r.strip()]
    if rules:
        rule_text = "\n".join(f"{i+1}. {r}" for i, r in enumerate(rules))
        parts.append("=== BEHAVIOR RULES (follow in order) ===\n" + rule_text)

    if config.language_policy == 'mirror':
        parts.append("Always reply in the same language the customer uses.")
    elif config.supported_languages:
        parts.append(f"Supported languages: {config.supported_languages}.")

    return "\n\n".join(parts) if parts else FALLBACK_SYSTEM


# ── Credit deduction ──────────────────────────────────────────────

def _deduct_credits(channel, model: str, input_tokens: int, output_tokens: int, conv_id=None) -> None:
    try:
        from billing.models import CreditAccount, CreditTransaction
        from django.db import transaction as db_tx

        with db_tx.atomic():
            account = CreditAccount.objects.select_for_update().filter(pk=1).first()
            if not account:
                account = CreditAccount.get_solo()

            cost = account.compute_cost(model, input_tokens, output_tokens)
            account.balance_usd -= cost
            account.save(update_fields=['balance_usd', 'updated_at'])

            desc = f'Canal {channel.id}'
            if conv_id:
                desc += f' · Conv {conv_id}'

            CreditTransaction.objects.create(
                type=CreditTransaction.TYPE_USAGE,
                amount_usd=-cost,
                balance_after=account.balance_usd,
                model_used=model,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                channel_id=channel.id,
                description=desc,
            )

            if account.balance_usd <= account.alert_threshold_usd:
                logger.warning('[Credits] Low balance: $%.4f USD remaining', account.balance_usd)

    except Exception as exc:
        logger.error('[Credits] Failed to record usage: %s', exc)


def _has_funds() -> bool:
    try:
        from billing.models import CreditAccount
        account = CreditAccount.get_solo()
        return account.has_funds()
    except Exception:
        return True  # fail open if billing DB is unavailable


# ── Main function ─────────────────────────────────────────────────

def get_ai_response(channel, conversation, incoming_text: str) -> tuple:
    """
    Returns (reply: str | None, should_handoff: bool).

    reply is None when:
    - AI is disabled for this channel
    - No master API key configured
    - No credit balance
    - Claude API call fails
    """
    creds = channel.credentials or {}

    if not creds.get('ai_enabled'):
        return None, False

    api_key = getattr(settings, 'ANTHROPIC_API_KEY', '').strip()
    if not api_key:
        logger.warning('[AI] ANTHROPIC_API_KEY not configured in .env')
        return None, False

    if not _has_funds():
        logger.warning('[AI] Insufficient credits — skipping AI response for channel %s', channel.id)
        return None, False

    # ── Handoff keyword detection ─────────────────────────────────
    raw_keywords = creds.get('ai_handoff_keywords', '')
    handoff_keywords = [k.strip().lower() for k in raw_keywords.split(',') if k.strip()]
    if handoff_keywords and any(kw in incoming_text.lower() for kw in handoff_keywords):
        logger.info('[AI] Handoff keyword detected for channel %s', channel.id)
        return None, True

    # ── Build conversation history ────────────────────────────────
    model         = creds.get('ai_model', 'claude-haiku-4-5-20251001')
    system_prompt = _build_system_prompt()
    context_count = max(1, min(50, int(creds.get('ai_context_messages') or 10)))
    max_tokens    = max(64, min(4096, int(creds.get('ai_max_tokens') or 1024)))

    history = list(
        conversation.messages
        .order_by('created_at')
        .values('role', 'content')
    )

    anthropic_messages = []
    for msg in history[-context_count:]:
        role    = ROLE_MAP.get(msg['role'], 'user')
        content = msg['content']
        if anthropic_messages and anthropic_messages[-1]['role'] == role:
            anthropic_messages[-1]['content'] += '\n' + content
        else:
            anthropic_messages.append({'role': role, 'content': content})

    if not anthropic_messages or anthropic_messages[0]['role'] != 'user':
        anthropic_messages.insert(0, {'role': 'user', 'content': incoming_text})
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
        reply        = response.content[0].text
        input_tokens = response.usage.input_tokens
        output_tokens = response.usage.output_tokens

        logger.info(
            '[AI] channel=%s model=%s in=%s out=%s',
            channel.id, model, input_tokens, output_tokens,
        )

        _deduct_credits(channel, model, input_tokens, output_tokens, conv_id=conversation.id)
        return reply, False

    except anthropic.AuthenticationError:
        logger.error('[AI] Invalid master API key — check ANTHROPIC_API_KEY in .env')
        return None, False
    except anthropic.RateLimitError:
        logger.warning('[AI] Rate limit hit')
        return None, False
    except Exception as exc:
        logger.error('[AI] Unexpected error for channel %s: %s', channel.id, exc)
        return None, False
