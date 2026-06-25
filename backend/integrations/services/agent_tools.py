"""
LangGraph tools for the omnichannel AI agent.

Adding a new tool: define a function with @tool, write a clear docstring
(Claude uses it to decide when to call it), then add it to AGENT_TOOLS.

conversation_id is injected from graph state via InjectedState — Claude never
sees it as a parameter to fill.
"""
import logging
from typing import Annotated

from langchain_core.messages import ToolMessage
from langchain_core.tools import InjectedToolCallId, tool
from langgraph.prebuilt import InjectedState
from langgraph.types import Command

logger = logging.getLogger(__name__)


def _close_thread_connection():
    """Close the worker-thread DB connection (ToolNode runs tools off-thread)."""
    from .custom_tools import _close_thread_connection as _close
    _close()


@tool
def search_knowledge_base(query: str) -> str:
    """
    Search the business knowledge base for information about products, services,
    prices, policies, hours, or any documented topic. ALWAYS call this tool before
    answering factual questions about the business — never guess or invent information.
    """
    from django.db.models import Q
    from knowledge.models import KnowledgeDoc

    try:
        docs = KnowledgeDoc.objects.filter(is_active=True).filter(
            Q(title__icontains=query) | Q(content__icontains=query)
        ).order_by('order', 'created_at')[:5]

        if not docs.exists():
            docs = KnowledgeDoc.objects.filter(is_active=True).order_by('order', 'created_at')[:3]

        if not docs.exists():
            return "No hay información disponible en la base de conocimiento."

        return "\n\n".join(f"[{d.title}]\n{d.content}" for d in docs)
    finally:
        _close_thread_connection()


@tool
def handoff_to_human(
    reason: str,
    tool_call_id: Annotated[str, InjectedToolCallId],
) -> Command:
    """
    Escalate this conversation to a human agent. Use when:
    - The customer explicitly asks to speak with a person or agent.
    - The issue is complex, sensitive, or requires human judgement.
    - You cannot resolve the request with available information or tools.
    Before calling this, tell the customer you are connecting them with a human.
    """
    logger.info('[Agent] Handoff to human. Reason: %s', reason)
    return Command(update={
        "should_handoff": True,
        "messages": [ToolMessage("Escalando a agente humano.", tool_call_id=tool_call_id)],
    })


@tool
def create_lead(
    notes: str,
    stage: str = "new",
    conversation_id: Annotated[int, InjectedState("conversation_id")] = 0,
) -> str:
    """
    Register a sales lead for this customer in the CRM. Call this when the customer
    shows buying intent, asks for a quote, or expresses clear interest in a product
    or service. Summarize their interest in the notes field.
    Valid stages: new, contacted, qualified, proposal, closed.
    """
    from contacts.models import Lead
    from conversations.models import Conversation

    try:
        conv = Conversation.objects.select_related('contact').get(pk=conversation_id)
        lead, created = Lead.objects.get_or_create(
            contact=conv.contact,
            defaults={"notes": notes, "stage": stage, "owner": ""},
        )
        if not created:
            lead.notes = notes
            lead.stage = stage
            lead.save(update_fields=["notes", "stage"])
        action = "creado" if created else "actualizado"
        logger.info('[Agent] Lead %s id=%s contact=%s', action, lead.id, conv.contact_id)
        return f"Lead {action} (id={lead.id})."
    except Conversation.DoesNotExist:
        return "No se pudo crear el lead: conversación no encontrada."
    except Exception as exc:
        logger.error('[Agent] create_lead error: %s', exc)
        return "No se pudo crear el lead en este momento."
    finally:
        _close_thread_connection()


@tool
def create_followup(
    reason: str,
    priority: str = "medium",
    conversation_id: Annotated[int, InjectedState("conversation_id")] = 0,
) -> str:
    """
    Schedule a follow-up task for this conversation. Use when the customer needs
    to be contacted again, requested a callback, or has a pending issue that requires
    attention later. Valid priorities: low, medium, high.
    """
    from contacts.models import FollowUp
    from conversations.models import Conversation

    try:
        conv = Conversation.objects.get(pk=conversation_id)
        followup = FollowUp.objects.create(
            conversation=conv,
            reason=reason,
            priority=priority,
            status="open",
        )
        logger.info('[Agent] FollowUp id=%s conv=%s', followup.id, conversation_id)
        return f"Seguimiento agendado (id={followup.id})."
    except Conversation.DoesNotExist:
        return "No se pudo agendar el seguimiento: conversación no encontrada."
    except Exception as exc:
        logger.error('[Agent] create_followup error: %s', exc)
        return "No se pudo agendar el seguimiento en este momento."
    finally:
        _close_thread_connection()


AGENT_TOOLS = [
    search_knowledge_base,
    handoff_to_human,
    create_lead,
    create_followup,
]
