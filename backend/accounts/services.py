"""
SLA escalation engine.

`scan_sla()` is the single entry point — called by the management command
`check_sla` (and, when a beat scheduler exists, a periodic Celery task).
It is idempotent: one SLAAlert per (conversation, level), so running it every
minute will not spam duplicate emails.
"""
import logging

from django.core.mail import send_mail
from django.conf import settings
from django.utils import timezone

logger = logging.getLogger(__name__)


def conversation_wait_minutes(conversation) -> int:
    """
    Minutes the customer has been waiting for a human reply.

    A conversation is "waiting" only when its most recent message came from the
    customer. If an agent already replied, the wait is 0.

    Uses the prefetched `messages` cache when available (see scan_sla) and sorts
    in Python — calling `.order_by()` here would bypass the prefetch and issue a
    query per conversation (N+1).
    """
    messages = list(conversation.messages.all())
    if not messages:
        return 0
    last = max(messages, key=lambda m: m.created_at)
    if last.role != 'customer':
        return 0
    delta = timezone.now() - last.created_at
    return max(0, int(delta.total_seconds() // 60))


def _send_escalation_email(workspace, conversation, wait_minutes) -> bool:
    if not workspace.escalation_email:
        logger.warning('[SLA] Escalation email not configured — skipping send.')
        return False
    try:
        contact = getattr(conversation.contact, 'name', 'un cliente')
        channel = getattr(conversation.channel, 'type', 'canal')
        send_mail(
            subject=f'[SLA] Conversación sin atención hace {wait_minutes} min',
            message=(
                f'La conversación #{conversation.id} con {contact} ({channel}) '
                f'lleva {wait_minutes} minutos sin respuesta humana y ha superado '
                f'el umbral de escalada ({workspace.sla_escalate_minutes} min).\n\n'
                f'Reasigna o atiende la conversación desde el panel de Seguimientos.'
            ),
            from_email=getattr(settings, 'DEFAULT_FROM_EMAIL', None),
            recipient_list=[workspace.escalation_email],
            fail_silently=False,
        )
        logger.info('[SLA] Escalation email sent to %s for conv %s',
                    workspace.escalation_email, conversation.id)
        return True
    except Exception as exc:
        logger.error('[SLA] Failed to send escalation email: %s', exc)
        return False


def scan_sla(organization=None) -> dict:
    """
    Evaluate human_takeover conversations against each organization's SLA tiers.
    Creates an SLAAlert the first time a conversation reaches each tier, and
    fires the escalation email + dashboard flag on the 'escalated' tier.

    Scopes to `organization` if given (on-demand scan from a tenant), otherwise
    iterates every active organization (the scheduled job).
    """
    from accounts.models import Workspace, SLAAlert, Organization

    summary = {'scanned': 0, 'warning': 0, 'critical': 0, 'escalated': 0, 'emails': 0}
    orgs = [organization] if organization is not None else Organization.objects.filter(is_active=True)
    for org in orgs:
        _scan_org_sla(org, Workspace.get_for_org(org), SLAAlert, summary)
    return summary


def _scan_org_sla(org, workspace, SLAAlert, summary) -> None:
    from conversations.models import Conversation

    convs = (Conversation.objects
             .filter(organization=org, status='human_takeover')
             .select_related('contact', 'channel', 'assigned_to')
             .prefetch_related('messages'))

    for conv in convs:
        summary['scanned'] += 1
        wait = conversation_wait_minutes(conv)
        tier = workspace.tier_for_wait(wait)
        if tier == 'ok':
            continue

        summary[tier] += 1
        alert, created = SLAAlert.objects.get_or_create(
            organization=org, conversation=conv, level=tier,
            defaults={'wait_minutes': wait},
        )
        if not created:
            if wait != alert.wait_minutes:
                alert.wait_minutes = wait
                alert.save(update_fields=['wait_minutes'])
            continue

        if tier == 'escalated' and workspace.escalation_enabled:
            if _send_escalation_email(workspace, conv, wait):
                alert.email_sent = True
                alert.email_to = workspace.escalation_email
                alert.save(update_fields=['email_sent', 'email_to'])
                summary['emails'] += 1

            if workspace.auto_reassign:
                _try_auto_reassign(conv)


def _try_auto_reassign(conversation):
    """Assign to the online agent (allowed on this channel) with the least load."""
    from accounts.models import Agent
    from django.db.models import Count

    candidates = (Agent.objects
                  .filter(is_active=True, availability=Agent.AVAIL_ONLINE,
                          organization_id=conversation.organization_id)
                  .filter(channels=conversation.channel)
                  .annotate(load=Count('conversations'))
                  .order_by('load'))
    agent = candidates.first()
    if agent:
        from django.utils import timezone
        conversation.assigned_to = agent
        conversation.assigned_at = timezone.now()
        conversation.save(update_fields=['assigned_to', 'assigned_at'])
        logger.info('[SLA] Auto-reassigned conv %s to %s', conversation.id, agent.name)
