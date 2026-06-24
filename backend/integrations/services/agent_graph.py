"""
LangGraph ReAct agent — replaces the direct Anthropic SDK call in ai_agent.py.

The graph follows the standard ReAct loop:
  check_preconditions → call_model → [tools? → call_model]* → finalize

Public API:
  run_agent(channel, conversation, incoming_text) -> (reply | None, should_handoff: bool)
"""
import logging

import anthropic as anthropic_sdk
from django.conf import settings
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import AIMessage as _AIMsg, HumanMessage, SystemMessage, ToolMessage
from langgraph.graph import StateGraph, END
from langgraph.prebuilt import ToolNode

from .agent_state import AgentState, MAX_ITERATIONS
from .agent_tools import AGENT_TOOLS

logger = logging.getLogger(__name__)

# ── System prompt helpers (shared with ai_agent.py) ───────────────

FALLBACK_SYSTEM = (
    "Eres un asistente de atención al cliente amable y profesional. "
    "Responde siempre en el mismo idioma que el cliente. "
    "Si no sabes la respuesta, búscala en la base de conocimiento antes de responder.\n\n"
    "=== HERRAMIENTAS (uso obligatorio) ===\n"
    "1. search_knowledge_base — ANTES de responder cualquier pregunta factual del negocio.\n"
    "2. create_lead — cuando el cliente expresa intención de compra. No pidas permiso.\n"
    "3. create_followup — cuando el cliente pide que lo llamen o agenda una cita. Ejecútalo de inmediato.\n"
    "4. handoff_to_human — cuando el cliente pide hablar con una persona.\n"
    "Llama la herramienta en el MISMO turno que la solicitud del cliente. Nunca describas una acción sin ejecutarla."
)

# Instrucciones de herramientas en español para agregar al prompt construido desde AIConfig
_TOOLS_ES = """=== HERRAMIENTAS (uso obligatorio) ===

1. search_knowledge_base — consultar ANTES de responder cualquier pregunta factual sobre el negocio (productos, precios, planes, canales, horarios, políticas, soporte). Nunca adivines.

2. create_lead — llamar cuando el cliente expresa intención de compra, pide una cotización, menciona su empresa o quiere contratar algo. No pidas permiso — ejecuta la herramienta y confirma en la respuesta.

3. create_followup — llamar cuando el cliente pide que lo llamen, menciona una cita futura o solicita contacto programado. No digas "lo agendaré" — ejecútalo de inmediato.

4. handoff_to_human — llamar cuando el cliente quiere hablar con una persona, tiene una queja legal/urgente o cuando no puedes ayudar tras usar las herramientas.

Llama la herramienta relevante en el MISMO turno de la solicitud. Nunca describas una acción sin ejecutarla con la herramienta correspondiente."""


def _build_system_prompt() -> str:
    try:
        from knowledge.models import AIConfig
        config = AIConfig.get_solo()
    except Exception:
        return FALLBACK_SYSTEM

    parts = []
    if config.identity_line:
        parts.append(config.identity_line)
    if config.agent_description:
        parts.append(config.agent_description)
    if config.overview:
        parts.append("=== CONTEXTO DEL NEGOCIO ===\n" + config.overview)

    rules = [r for r in (config.behavior_rules or []) if r and r.strip()]
    if rules:
        rule_text = "\n".join(f"{i+1}. {r}" for i, r in enumerate(rules))
        parts.append("=== REGLAS DE COMPORTAMIENTO ===\n" + rule_text)

    if config.language_policy == 'mirror':
        parts.append("Responde siempre en el mismo idioma que usa el cliente.")
    elif config.supported_languages:
        parts.append(f"Idiomas soportados: {config.supported_languages}.")

    parts.append(_TOOLS_ES)
    return "\n\n".join(parts) if parts else FALLBACK_SYSTEM


# ── Billing helpers ───────────────────────────────────────────────

def _has_funds() -> bool:
    try:
        from billing.models import CreditAccount
        return CreditAccount.get_solo().has_funds()
    except Exception:
        return True  # fail open


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


# ── Graph nodes ───────────────────────────────────────────────────

def _node_call_model(state: AgentState) -> dict:
    api_key = getattr(settings, 'ANTHROPIC_API_KEY', '').strip()
    model = ChatAnthropic(
        model=state['model'],
        api_key=api_key,
        max_tokens=state['max_tokens'],
        timeout=60,
    ).bind_tools(AGENT_TOOLS)

    try:
        response = model.invoke(state['messages'])
    except (anthropic_sdk.APITimeoutError, anthropic_sdk.APIConnectionError) as exc:
        logger.warning('[Agent] Claude connection error (timeout/network): %s', exc)
        fallback = _AIMsg(content="Lo siento, la respuesta tardó demasiado. Por favor intenta de nuevo.")
        return {
            'messages': [fallback],
            'total_input_tokens': state.get('total_input_tokens', 0),
            'total_output_tokens': state.get('total_output_tokens', 0),
        }
    except anthropic_sdk.RateLimitError as exc:
        logger.warning('[Agent] Claude rate limit: %s', exc)
        fallback = _AIMsg(content="Estamos recibiendo muchas solicitudes. Intenta en unos segundos.")
        return {
            'messages': [fallback],
            'total_input_tokens': state.get('total_input_tokens', 0),
            'total_output_tokens': state.get('total_output_tokens', 0),
        }
    except Exception as exc:
        logger.error('[Agent] Claude error: %s', exc)
        return {
            'messages': [],
            'total_input_tokens': state.get('total_input_tokens', 0),
            'total_output_tokens': state.get('total_output_tokens', 0),
        }

    usage = getattr(response, 'usage_metadata', None) or {}
    input_tokens = usage.get('input_tokens', 0)
    output_tokens = usage.get('output_tokens', 0)

    logger.debug(
        '[Agent] call_model model=%s in=%s out=%s tool_calls=%s',
        state['model'], input_tokens, output_tokens,
        len(response.tool_calls) if hasattr(response, 'tool_calls') else 0,
    )

    return {
        'messages': [response],
        'total_input_tokens': state.get('total_input_tokens', 0) + input_tokens,
        'total_output_tokens': state.get('total_output_tokens', 0) + output_tokens,
    }


def _route_after_model(state: AgentState) -> str:
    messages = state.get('messages', [])
    if not messages:
        return 'finalize'

    last = messages[-1]

    if state.get('should_handoff'):
        return 'finalize'

    # Guard: count AI messages with tool calls to enforce MAX_ITERATIONS
    iterations = sum(
        1 for m in messages
        if hasattr(m, 'tool_calls') and m.tool_calls
    )
    if iterations >= MAX_ITERATIONS:
        logger.warning('[Agent] MAX_ITERATIONS reached — stopping loop')
        return 'finalize'

    if hasattr(last, 'tool_calls') and last.tool_calls:
        return 'execute_tools'

    return 'finalize'


def _node_finalize(state: AgentState) -> dict:
    return {}


# ── Build and compile the graph ───────────────────────────────────

def _build_graph():
    tool_node = ToolNode(AGENT_TOOLS)

    builder = StateGraph(AgentState)
    builder.add_node('call_model', _node_call_model)
    builder.add_node('execute_tools', tool_node)
    builder.add_node('finalize', _node_finalize)

    builder.set_entry_point('call_model')
    builder.add_conditional_edges('call_model', _route_after_model, {
        'execute_tools': 'execute_tools',
        'finalize': 'finalize',
    })
    builder.add_edge('execute_tools', 'call_model')
    builder.add_edge('finalize', END)

    return builder.compile()


# Compiled once at import time — invocation is cheap, compilation is not
_graph = _build_graph()


# ── Public API ────────────────────────────────────────────────────

def run_agent(channel, conversation, incoming_text: str) -> tuple:
    """
    Invoke the LangGraph ReAct agent and return (reply | None, should_handoff: bool).
    Called from ai_agent.get_ai_response() after precondition checks.
    """
    api_key = getattr(settings, 'ANTHROPIC_API_KEY', '').strip()
    if not api_key:
        logger.warning('[Agent] ANTHROPIC_API_KEY not set')
        return None, False

    if not _has_funds():
        logger.warning('[Agent] Insufficient credits for channel %s', channel.id)
        return None, False

    creds = channel.credentials or {}
    model = creds.get('ai_model', 'claude-haiku-4-5-20251001')
    max_tokens = max(64, min(4096, int(creds.get('ai_max_tokens') or 1024)))
    context_count = max(1, min(50, int(creds.get('ai_context_messages') or 10)))

    # Build conversation history from Django DB
    ROLE_MAP = {'customer': 'human', 'ai': 'ai', 'agent': 'ai'}
    history = list(
        conversation.messages.order_by('created_at').values('role', 'content')
    )[-context_count:]

    from langchain_core.messages import AIMessage
    lc_messages = []
    for msg in history:
        role = ROLE_MAP.get(msg['role'], 'human')
        content = msg['content']
        if lc_messages and (
            (role == 'human' and isinstance(lc_messages[-1], HumanMessage)) or
            (role == 'ai' and isinstance(lc_messages[-1], AIMessage))
        ):
            lc_messages[-1].content += '\n' + content
        else:
            lc_messages.append(
                HumanMessage(content=content) if role == 'human' else AIMessage(content=content)
            )

    # Ensure the conversation ends with the current user message.
    # In the webhook flow the message is already saved to DB (last in history).
    # In direct calls (tests, widget) it may not be — always append if not present.
    if not lc_messages:
        lc_messages.append(HumanMessage(content=incoming_text))
    elif not isinstance(lc_messages[-1], HumanMessage):
        lc_messages.append(HumanMessage(content=incoming_text))
    elif incoming_text.strip() not in lc_messages[-1].content:
        lc_messages.append(HumanMessage(content=incoming_text))

    system_prompt = _build_system_prompt()
    initial_messages = [SystemMessage(content=system_prompt)] + lc_messages

    initial_state: AgentState = {
        'messages': initial_messages,
        'channel_id': channel.id,
        'conversation_id': conversation.id,
        'model': model,
        'max_tokens': max_tokens,
        'should_handoff': False,
        'total_input_tokens': 0,
        'total_output_tokens': 0,
    }

    try:
        final_state = _graph.invoke(initial_state)
    except Exception as exc:
        logger.error('[Agent] Graph error for channel %s: %s', channel.id, exc)
        return None, False

    should_handoff = final_state.get('should_handoff', False)

    # Extract the last AI text response (AIMessage only, never HumanMessage)
    from langchain_core.messages import AIMessage as LCAIMessage
    reply = None
    for msg in reversed(final_state.get('messages', [])):
        if not isinstance(msg, LCAIMessage):
            continue
        content = msg.content if isinstance(msg.content, str) else ''
        if content.strip() and not (hasattr(msg, 'tool_calls') and msg.tool_calls):
            reply = content.strip()
            break

    # Deduct credits for the full loop
    total_in = final_state.get('total_input_tokens', 0)
    total_out = final_state.get('total_output_tokens', 0)
    if total_in or total_out:
        _deduct_credits(channel, model, total_in, total_out, conv_id=conversation.id)

    logger.info(
        '[Agent] channel=%s model=%s in=%s out=%s handoff=%s reply_len=%s',
        channel.id, model, total_in, total_out, should_handoff,
        len(reply) if reply else 0,
    )

    return reply, should_handoff
