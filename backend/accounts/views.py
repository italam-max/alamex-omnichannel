from django.contrib.auth import get_user_model
from django.db.models import Count, Q
from django.utils import timezone
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from conversations.models import Conversation
from .models import Agent, SLAAlert, Workspace
from .permissions import IsAdmin, IsSupervisorOrAdmin
from .serializers import AgentSerializer, SLAAlertSerializer, WorkspaceSerializer
from .tenancy import TenantScopedViewSet, org_for_request

User = get_user_model()


class WorkspaceViewSet(viewsets.ViewSet):
    """Per-org business-rules config. GET for any member; PATCH for admins."""
    permission_classes = [IsAdmin]

    def list(self, request):
        return Response(WorkspaceSerializer(Workspace.get_for_org(org_for_request(request))).data)

    @action(detail=False, methods=['patch', 'put'], url_path='update')
    def update_rules(self, request):
        ws = Workspace.get_for_org(org_for_request(request))
        ser = WorkspaceSerializer(ws, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        ser.save()
        return Response(ser.data)


class AgentViewSet(TenantScopedViewSet, viewsets.ModelViewSet):
    queryset = Agent.objects.select_related('user').prefetch_related('channels').all()
    serializer_class = AgentSerializer
    permission_classes = [IsAdmin]

    def get_permissions(self):
        # An agent may read the roster and update their own availability.
        if self.action in ('list', 'retrieve', 'me', 'set_availability'):
            return [IsAuthenticated()]
        return [IsAdmin()]

    def perform_create(self, serializer):
        """Stamp the org and give the new agent's user a membership so they can
        log in and be scoped to this organization."""
        from .models import Membership
        org = self.organization
        agent = serializer.save(organization=org)
        if org is not None and agent.user_id:
            Membership.objects.get_or_create(
                user=agent.user, organization=org,
                defaults={'role': agent.role, 'is_default': True})

    def perform_destroy(self, instance):
        """Deactivate instead of hard-deleting — preserves conversation history."""
        instance.is_active = False
        instance.availability = Agent.AVAIL_AWAY
        instance.save(update_fields=['is_active', 'availability', 'updated_at'])
        instance.user.is_active = False
        instance.user.save(update_fields=['is_active'])

    @action(detail=False, methods=['get'])
    def me(self, request):
        org = org_for_request(request)
        org_data = {'slug': org.slug, 'name': org.name} if org else None
        profile = getattr(request.user, 'agent_profile', None)
        if not profile:
            # Superuser without an Agent row → synthesize an admin identity.
            return Response({
                'id': None, 'name': request.user.get_username(),
                'role': 'admin', 'is_superuser': True,
                'organization': org_data,
                'permissions': {k: True for k in (
                    'manage_agents', 'configure_rules', 'manage_channels',
                    'view_all_convs', 'reassign', 'view_billing', 'attend_convs')},
            })
        data = AgentSerializer(profile).data
        data['organization'] = org_data
        # A superuser must keep operator powers even after an Agent row exists
        # for them (e.g. auto-provisioned when they claimed a conversation) —
        # otherwise the operator console would vanish from the sidebar.
        data['is_superuser'] = request.user.is_superuser
        if request.user.is_superuser:
            data['permissions'] = {k: True for k in (
                'manage_agents', 'configure_rules', 'manage_channels',
                'view_all_convs', 'reassign', 'view_billing', 'attend_convs')}
        return Response(data)

    @action(detail=True, methods=['patch'], url_path='availability')
    def set_availability(self, request, pk=None):
        agent = self.get_object()
        value = request.data.get('availability')
        if value not in dict(Agent.AVAILABILITY_CHOICES):
            return Response({'detail': 'availability inválida'}, status=400)
        agent.availability = value
        agent.save(update_fields=['availability', 'updated_at'])
        return Response(AgentSerializer(agent).data)

    @action(detail=True, methods=['post'], url_path='reactivate', permission_classes=[IsAdmin])
    def reactivate(self, request, pk=None):
        agent = self.get_object()
        agent.is_active = True
        agent.save(update_fields=['is_active', 'updated_at'])
        agent.user.is_active = True
        agent.user.save(update_fields=['is_active'])
        return Response(AgentSerializer(agent).data)


class SLAAlertViewSet(TenantScopedViewSet, viewsets.ReadOnlyModelViewSet):
    serializer_class = SLAAlertSerializer
    permission_classes = [IsSupervisorOrAdmin]

    def get_queryset(self):
        qs = SLAAlert.objects.select_related(
            'conversation__contact', 'conversation__channel', 'conversation__assigned_to').all()
        if self.request.query_params.get('open') == 'true':
            qs = qs.filter(resolved=False)
        return self.scope_to_org(qs)

    @action(detail=False, methods=['post'], url_path='scan')
    def scan(self, request):
        """Run the SLA engine for this organization on demand."""
        from .services import scan_sla
        return Response(scan_sla(self.organization))

    @action(detail=True, methods=['post'], url_path='resolve')
    def resolve(self, request, pk=None):
        alert = self.get_object()
        alert.resolved = True
        alert.acknowledged = True
        profile = getattr(request.user, 'agent_profile', None)
        if profile:
            alert.acknowledged_by = profile
        alert.save(update_fields=['resolved', 'acknowledged', 'acknowledged_by'])
        return Response(SLAAlertSerializer(alert).data)


class ReassignView(viewsets.ViewSet):
    """POST /api/accounts/reassign/ { conversation, agent }"""
    permission_classes = [IsSupervisorOrAdmin]

    def create(self, request):
        org = org_for_request(request)
        conv_id  = request.data.get('conversation')
        agent_id = request.data.get('agent')
        try:
            conv = Conversation.objects.get(pk=conv_id, organization=org)
        except Conversation.DoesNotExist:
            return Response({'detail': 'Conversación no encontrada'}, status=404)
        try:
            agent = Agent.objects.get(pk=agent_id, is_active=True, organization=org)
        except Agent.DoesNotExist:
            return Response({'detail': 'Agente no válido'}, status=400)

        conv.assigned_to = agent
        conv.assigned_at = timezone.now()
        conv.status = 'human_takeover'
        conv.save(update_fields=['assigned_to', 'assigned_at', 'status', 'updated_at'])

        # Resolve any open SLA alerts — the conversation now has an owner.
        SLAAlert.objects.filter(conversation=conv, resolved=False).update(
            resolved=True, acknowledged=True)

        return Response({'ok': True, 'conversation': conv.id, 'agent': agent.name})


class TeamStatsView(viewsets.ViewSet):
    """Aggregate counters for the admin dashboard."""
    permission_classes = [IsAuthenticated]

    def list(self, request):
        org = org_for_request(request)
        agents = Agent.objects.filter(is_active=True, organization=org)
        return Response({
            'agents_total':   agents.count(),
            'agents_online':  agents.filter(availability=Agent.AVAIL_ONLINE).count(),
            'open_alerts':    SLAAlert.objects.filter(resolved=False, organization=org).count(),
            'escalated':      SLAAlert.objects.filter(resolved=False, level='escalated', organization=org).count(),
            'human_waiting':  Conversation.objects.filter(status='human_takeover', organization=org).count(),
        })


CHANNEL_LABELS = {
    'whatsapp': 'WhatsApp', 'messenger': 'Messenger',
    'instagram': 'Instagram', 'website': 'Web',
}
_DAY_ES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']


class OverviewView(viewsets.ViewSet):
    """Real, organization-scoped KPIs for the command-center dashboard.

    Everything here is the caller's own org (resolved via org_for_request) — the
    headline numbers, the AI containment metric, channel mix, lead pipeline, the
    live operation state, and a 7-day activity series for the sparklines."""
    permission_classes = [IsAuthenticated]

    def list(self, request):
        from datetime import timedelta
        from decimal import Decimal
        from django.db.models import Sum
        from django.db.models.functions import TruncDate
        from billing.models import CreditTransaction, CreditAccount
        from contacts.models import Lead, FollowUp
        from conversations.models import Message, Channel

        org = org_for_request(request)
        now = timezone.now()
        today = timezone.localdate()
        week_ago = now - timedelta(days=7)
        day0 = today - timedelta(days=6)

        convs = Conversation.objects.filter(organization=org)
        msgs = Message.objects.filter(organization=org)

        # ── Headline ───────────────────────────────────────────────
        convs_today = convs.filter(created_at__date=today).count()
        msgs_today = msgs.filter(created_at__date=today).count()
        human_active = convs.filter(status='human_takeover').count()
        leads_week = Lead.objects.filter(organization=org, created_at__gte=week_ago).count()

        # ── AI performance (last 7 days) ───────────────────────────
        convs_7d = convs.filter(created_at__gte=week_ago)
        total_7d = convs_7d.count()
        # A conversation "escaped" the AI if a human took over or got assigned.
        handoffs_7d = convs_7d.filter(
            Q(status='human_takeover') | Q(assigned_to__isnull=False)).distinct().count()
        containment = round((total_7d - handoffs_7d) / total_7d * 100) if total_7d else 0

        msgs_7d = msgs.filter(created_at__gte=week_ago)
        ai_msgs_7d = msgs_7d.filter(role='ai').count()
        customer_msgs_7d = msgs_7d.filter(role='customer').count()

        usage = (CreditTransaction.objects
                 .filter(organization=org, type=CreditTransaction.TYPE_USAGE, created_at__gte=week_ago)
                 .aggregate(tin=Sum('input_tokens'), tout=Sum('output_tokens'), cost=Sum('amount_usd')))
        cost_7d = abs(usage['cost'] or Decimal('0'))

        acct = CreditAccount.get_for_org(org)

        # ── Channels (dynamic, per connected channel) ──────────────
        # The hero shows a KPI per channel the org actually has connected
        # (active), with today's + historical conversation counts.
        connected = set(Channel.objects.filter(organization=org, is_active=True)
                        .values_list('type', flat=True))
        ch_total = {row['channel__type']: row['n'] for row in
                    convs.values('channel__type').annotate(n=Count('id'))}
        ch_today = {row['channel__type']: row['n'] for row in
                    convs.filter(created_at__date=today).values('channel__type').annotate(n=Count('id'))}
        channels = [
            {'type': t, 'label': CHANNEL_LABELS.get(t, t or 'Otro'),
             'today': ch_today.get(t, 0), 'total': ch_total.get(t, 0)}
            for t in ['whatsapp', 'instagram', 'messenger', 'website']
            if t in connected
        ]

        # ── Lead pipeline ──────────────────────────────────────────
        stage_counts = {row['stage']: row['n'] for row in
                        Lead.objects.filter(organization=org).values('stage').annotate(n=Count('id'))}
        lead_value = (Lead.objects.filter(organization=org)
                      .aggregate(v=Sum('value'))['v'] or Decimal('0'))

        # ── Live operation ─────────────────────────────────────────
        agents = Agent.objects.filter(is_active=True, organization=org)

        # ── 7-day activity series (for sparklines) ─────────────────
        conv_by_day = {r['d']: r['n'] for r in convs.filter(created_at__date__gte=day0)
                       .annotate(d=TruncDate('created_at')).values('d').annotate(n=Count('id'))}
        ai_by_day = {r['d']: r['n'] for r in msgs_7d.filter(role='ai', created_at__date__gte=day0)
                     .annotate(d=TruncDate('created_at')).values('d').annotate(n=Count('id'))}
        days, conv_series, ai_series = [], [], []
        for i in range(7):
            d = day0 + timedelta(days=i)
            days.append(_DAY_ES[d.weekday()])
            conv_series.append(conv_by_day.get(d, 0))
            ai_series.append(ai_by_day.get(d, 0))

        return Response({
            'headline': {
                'conversations_today': convs_today,
                'conversations_total': convs.count(),
                'messages_today': msgs_today,
                'ai_containment_rate': containment,
                'human_active': human_active,
                'leads_week': leads_week,
            },
            'ai': {
                'ai_messages_7d': ai_msgs_7d,
                'customer_messages_7d': customer_msgs_7d,
                'handoffs_7d': handoffs_7d,
                'conversations_7d': total_7d,
                'tokens_in_7d': usage['tin'] or 0,
                'tokens_out_7d': usage['tout'] or 0,
                'cost_7d': f'{cost_7d:.4f}',
            },
            'credits': {
                'balance_usd': f'{acct.balance_usd:.2f}',
                'alert_threshold_usd': f'{acct.alert_threshold_usd:.2f}',
                'low': acct.balance_usd < acct.alert_threshold_usd * 2,
            },
            'channels': channels,
            'leads': {
                'by_stage': {s: stage_counts.get(s, 0) for s in
                             ['new', 'contacted', 'qualified', 'proposal', 'closed']},
                'total': sum(stage_counts.values()),
                'value_usd': f'{lead_value:.2f}',
            },
            'ops': {
                'sla_open': SLAAlert.objects.filter(resolved=False, organization=org).count(),
                'agents_online': agents.filter(availability=Agent.AVAIL_ONLINE).count(),
                'agents_total': agents.count(),
                'followups_open': FollowUp.objects.filter(
                    organization=org, status__in=['open', 'in_progress']).count(),
            },
            'series': {'days': days, 'conversations': conv_series, 'ai_messages': ai_series},
        })
