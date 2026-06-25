"""
Tenant-defined custom tools for the agent.

These are DECLARATIVE: a tenant configures an instance of a platform-defined
archetype (collect_data, tag_route, canned_response, webhook). We generate a
LangChain StructuredTool per active CustomTool and dispatch execution through a
single safe handler — the tenant never runs arbitrary code.

The current conversation id is carried via a ContextVar (set in run_agent) so
the LLM-facing tool schema only exposes the tenant's own parameters.
"""
import contextvars
import logging
import threading
from decimal import Decimal
from typing import Optional

import requests
from pydantic import Field, create_model
from langchain_core.tools import StructuredTool

logger = logging.getLogger(__name__)

# Conversation id for the in-flight agent run (avoids InjectedState plumbing
# for dynamically built tools).
current_conversation_id = contextvars.ContextVar('current_conversation_id', default=None)

_PY_TYPES = {'string': str, 'number': float, 'integer': int, 'boolean': bool}

WEBHOOK_TIMEOUT_S = 5
WEBHOOK_MAX_RESPONSE_CHARS = 2000


# ── Tool generation ───────────────────────────────────────────────

def build_custom_tools():
    """Return a list of StructuredTool for every active custom tool."""
    from knowledge.models import CustomTool

    tools = []
    for ct in CustomTool.objects.filter(is_active=True):
        try:
            tools.append(_make_structured_tool(ct))
        except Exception as exc:  # never let a bad tool break the agent
            logger.error('[CustomTool] skipping "%s": %s', ct.name, exc)
    return tools


def active_tools_signature() -> str:
    """A cheap key that changes whenever the active tool set changes — used to
    cache compiled graphs without rebuilding on every request."""
    from knowledge.models import CustomTool

    rows = CustomTool.objects.filter(is_active=True).values_list('id', 'updated_at')
    return '|'.join(f'{i}:{u.timestamp()}' for i, u in rows) or 'none'


def _make_structured_tool(ct) -> StructuredTool:
    fields = {}
    for p in (ct.parameters or []):
        pname = p.get('name')
        if not pname:
            continue
        pytype = _PY_TYPES.get(p.get('type'), str)
        required = bool(p.get('required'))
        descr = p.get('description', '')
        if required:
            fields[pname] = (pytype, Field(..., description=descr))
        else:
            fields[pname] = (Optional[pytype], Field(default=None, description=descr))

    args_model = create_model(f'{ct.name}_Args', **fields)

    def _runner(**kwargs):
        return _dispatch(ct, kwargs)

    return StructuredTool.from_function(
        func=_runner,
        name=ct.name,
        description=ct.description or ct.display_name or ct.name,
        args_schema=args_model,
    )


# ── Dispatch ──────────────────────────────────────────────────────

def _dispatch(ct, args: dict) -> str:
    """Execute a custom tool by archetype, logging an audit/billing record."""
    from knowledge.models import CustomTool, CustomToolRun

    conv_id = current_conversation_id.get()
    status = CustomToolRun.STATUS_OK
    cost = Decimal('0')
    try:
        if ct.archetype == CustomTool.ARCHETYPE_COLLECT:
            result = _do_collect(ct, args, conv_id)
        elif ct.archetype == CustomTool.ARCHETYPE_TAG:
            result = _do_tag_route(ct, args, conv_id)
        elif ct.archetype == CustomTool.ARCHETYPE_CANNED:
            result = _do_canned(ct, args)
        elif ct.archetype == CustomTool.ARCHETYPE_WEBHOOK:
            result, cost = _do_webhook(ct, args)
        else:
            result = 'Herramienta no soportada.'
            status = CustomToolRun.STATUS_ERROR
    except _ToolError as exc:
        result, status = str(exc), CustomToolRun.STATUS_ERROR
    except Exception as exc:
        logger.error('[CustomTool] "%s" failed: %s', ct.name, exc)
        result, status = 'No se pudo ejecutar la herramienta en este momento.', CustomToolRun.STATUS_ERROR

    try:
        CustomToolRun.objects.create(
            tool=ct, tool_name=ct.name, conversation_id=conv_id,
            arguments=args, status=status, result=result[:2000], cost_usd=cost,
        )
    except Exception as exc:
        logger.error('[CustomTool] could not log run for "%s": %s', ct.name, exc)
    finally:
        # ToolNode runs tools in a worker thread; close its thread-local DB
        # connection so it isn't left open/stale across runs.
        _close_thread_connection()
    return result


def _close_thread_connection() -> None:
    """Close the DB connection if we're in a ToolNode worker thread (not the
    main/request thread, whose connection is managed by Django/pytest)."""
    if threading.current_thread() is threading.main_thread():
        return
    try:
        from django.db import connection
        connection.close()
    except Exception:
        pass


class _ToolError(Exception):
    """A user-facing tool failure (returned to the LLM as the tool result)."""


# ── Archetype handlers ────────────────────────────────────────────

def _do_collect(ct, args, conv_id) -> str:
    """Structured data capture — the run record itself stores the payload."""
    label = ct.display_name or ct.name
    filled = ', '.join(f'{k}: {v}' for k, v in args.items() if v not in (None, ''))
    return f'Datos de "{label}" registrados.' + (f' ({filled})' if filled else '')


def _do_tag_route(ct, args, conv_id) -> str:
    """Tag/route the conversation. Optionally escalate to a human."""
    from conversations.models import Conversation

    tag = ct.config.get('tag') or ct.name
    if conv_id and ct.config.get('escalate'):
        Conversation.objects.filter(pk=conv_id).update(status='human_takeover', ai_active=False)
        return f'Conversación etiquetada como "{tag}" y escalada a un agente humano.'
    return f'Conversación etiquetada como "{tag}".'


def _do_canned(ct, args) -> str:
    """Return configured text, or the content of a linked knowledge doc."""
    doc_id = ct.config.get('doc_id')
    if doc_id:
        from knowledge.models import KnowledgeDoc
        doc = KnowledgeDoc.objects.filter(pk=doc_id, is_active=True).first()
        if doc:
            return doc.content
    return ct.config.get('text') or 'Sin contenido configurado.'


def _do_webhook(ct, args):
    """POST the gathered args to the tenant's endpoint, with SSRF guardrails."""
    from accounts.models import Workspace

    url = (ct.config.get('url') or '').strip()
    method = (ct.config.get('method') or 'POST').upper()
    headers = ct.config.get('headers') or {}

    ws = Workspace.get_solo()
    _validate_webhook_target(url, ws.webhook_domain_allowlist)

    try:
        resp = requests.request(
            method, url, json=args, headers=headers,
            timeout=WEBHOOK_TIMEOUT_S, allow_redirects=False,
        )
    except requests.RequestException as exc:
        raise _ToolError(f'No se pudo contactar el servicio externo: {exc.__class__.__name__}.')

    # Charge per successful external call — protects our margin.
    cost = _charge_tool_run(ws.tool_run_cost_usd, ct.name)
    body = (resp.text or '')[:WEBHOOK_MAX_RESPONSE_CHARS]
    return f'Webhook ejecutado (HTTP {resp.status_code}). Respuesta: {body}', cost


# ── Webhook safety (anti-SSRF) ────────────────────────────────────

def _validate_webhook_target(url: str, allowlist: str) -> None:
    from .net_safety import url_safety_error
    reason = url_safety_error(url, require_https=True, allowlist=allowlist)
    if reason:
        raise _ToolError(f'Webhook rechazado: {reason}')


def _charge_tool_run(cost_usd, tool_name) -> Decimal:
    if not cost_usd or cost_usd <= 0:
        return Decimal('0')
    try:
        from billing.models import CreditAccount, CreditTransaction
        from django.db import transaction as db_tx
        with db_tx.atomic():
            account = CreditAccount.objects.select_for_update().filter(pk=1).first() or CreditAccount.get_solo()
            account.balance_usd -= cost_usd
            account.save(update_fields=['balance_usd', 'updated_at'])
            CreditTransaction.objects.create(
                type=CreditTransaction.TYPE_USAGE,
                amount_usd=-cost_usd,
                balance_after=account.balance_usd,
                description=f'Herramienta {tool_name} (webhook)',
            )
        return Decimal(cost_usd)
    except Exception as exc:
        logger.error('[CustomTool] billing failed for "%s": %s', tool_name, exc)
        return Decimal('0')
