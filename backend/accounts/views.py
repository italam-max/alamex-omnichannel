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

User = get_user_model()


class WorkspaceViewSet(viewsets.ViewSet):
    """Singleton config. GET for any authenticated user; PATCH for admins."""
    permission_classes = [IsAdmin]

    def list(self, request):
        return Response(WorkspaceSerializer(Workspace.get_solo()).data)

    @action(detail=False, methods=['patch', 'put'], url_path='update')
    def update_rules(self, request):
        ws = Workspace.get_solo()
        ser = WorkspaceSerializer(ws, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        ser.save()
        return Response(ser.data)


class AgentViewSet(viewsets.ModelViewSet):
    queryset = Agent.objects.select_related('user').prefetch_related('channels').all()
    serializer_class = AgentSerializer
    permission_classes = [IsAdmin]

    def get_permissions(self):
        # An agent may read the roster and update their own availability.
        if self.action in ('list', 'retrieve', 'me', 'set_availability'):
            return [IsAuthenticated()]
        return [IsAdmin()]

    def perform_destroy(self, instance):
        """Deactivate instead of hard-deleting — preserves conversation history."""
        instance.is_active = False
        instance.availability = Agent.AVAIL_AWAY
        instance.save(update_fields=['is_active', 'availability', 'updated_at'])
        instance.user.is_active = False
        instance.user.save(update_fields=['is_active'])

    @action(detail=False, methods=['get'])
    def me(self, request):
        profile = getattr(request.user, 'agent_profile', None)
        if not profile:
            # Superuser without an Agent row → synthesize an admin identity.
            return Response({
                'id': None, 'name': request.user.get_username(),
                'role': 'admin', 'is_superuser': True,
                'permissions': {k: True for k in (
                    'manage_agents', 'configure_rules', 'manage_channels',
                    'view_all_convs', 'reassign', 'view_billing', 'attend_convs')},
            })
        return Response(AgentSerializer(profile).data)

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


class SLAAlertViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = SLAAlertSerializer
    permission_classes = [IsSupervisorOrAdmin]

    def get_queryset(self):
        qs = SLAAlert.objects.select_related(
            'conversation__contact', 'conversation__channel', 'conversation__assigned_to').all()
        if self.request.query_params.get('open') == 'true':
            qs = qs.filter(resolved=False)
        return qs

    @action(detail=False, methods=['post'], url_path='scan')
    def scan(self, request):
        """Run the SLA engine on demand and return the summary."""
        from .services import scan_sla
        return Response(scan_sla())

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
        conv_id  = request.data.get('conversation')
        agent_id = request.data.get('agent')
        try:
            conv = Conversation.objects.get(pk=conv_id)
        except Conversation.DoesNotExist:
            return Response({'detail': 'Conversación no encontrada'}, status=404)
        try:
            agent = Agent.objects.get(pk=agent_id, is_active=True)
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
        agents = Agent.objects.filter(is_active=True)
        return Response({
            'agents_total':   agents.count(),
            'agents_online':  agents.filter(availability=Agent.AVAIL_ONLINE).count(),
            'open_alerts':    SLAAlert.objects.filter(resolved=False).count(),
            'escalated':      SLAAlert.objects.filter(resolved=False, level='escalated').count(),
            'human_waiting':  Conversation.objects.filter(status='human_takeover').count(),
        })
