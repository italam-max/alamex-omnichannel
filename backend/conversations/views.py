import requests as http_requests
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.conf import settings

from .models import Channel, Contact, Conversation, Message
from .serializers import ChannelSerializer, ContactSerializer, ConversationSerializer, MessageSerializer

GRAPH_URL = "https://graph.facebook.com/v21.0"


class ChannelViewSet(viewsets.ModelViewSet):
    queryset = Channel.objects.all().order_by('id')
    serializer_class = ChannelSerializer
    permission_classes = [IsAuthenticated]

    @action(detail=True, methods=['post'], url_path='test')
    def test_connection(self, request, pk=None):
        """Verify stored credentials against Meta Graph API."""
        channel = self.get_object()
        creds = channel.credentials or {}
        channel_type = channel.type

        try:
            if channel_type == 'whatsapp':
                phone_id = creds.get('phone_number_id', '')
                token = creds.get('access_token', '')
                if not phone_id or not token:
                    return Response({'ok': False, 'detail': 'Faltan phone_number_id o access_token'})
                resp = http_requests.get(
                    f"{GRAPH_URL}/{phone_id}",
                    params={'access_token': token},
                    timeout=8,
                )
                ok = resp.status_code == 200
                return Response({'ok': ok, 'detail': resp.json()})

            elif channel_type == 'messenger':
                page_id = creds.get('page_id', '')
                token = creds.get('page_access_token', '')
                if not page_id or not token:
                    return Response({'ok': False, 'detail': 'Faltan page_id o page_access_token'})
                resp = http_requests.get(
                    f"{GRAPH_URL}/{page_id}",
                    params={'access_token': token, 'fields': 'id,name'},
                    timeout=8,
                )
                ok = resp.status_code == 200
                return Response({'ok': ok, 'detail': resp.json()})

            elif channel_type == 'instagram':
                account_id = creds.get('instagram_account_id', '')
                token = creds.get('access_token', '')
                if not account_id or not token:
                    return Response({'ok': False, 'detail': 'Faltan instagram_account_id o access_token'})
                resp = http_requests.get(
                    f"{GRAPH_URL}/{account_id}",
                    params={'access_token': token, 'fields': 'id,name,username'},
                    timeout=8,
                )
                ok = resp.status_code == 200
                return Response({'ok': ok, 'detail': resp.json()})

            return Response({'ok': False, 'detail': f'Tipo de canal desconocido: {channel_type}'})

        except Exception as e:
            return Response({'ok': False, 'detail': str(e)}, status=status.HTTP_502_BAD_GATEWAY)


class ContactViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Contact.objects.select_related('channel').all()
    serializer_class = ContactSerializer
    permission_classes = [IsAuthenticated]


class ConversationViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = (Conversation.objects
                .select_related('channel', 'contact', 'assigned_to')
                .prefetch_related('messages')
                .order_by('-updated_at'))
    serializer_class = ConversationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = super().get_queryset()
        params = self.request.query_params
        profile = getattr(self.request.user, 'agent_profile', None)

        # Agent workspace: only conversations assigned to the current agent.
        if params.get('assigned') == 'me':
            qs = qs.filter(assigned_to=profile) if profile else qs.none()

        # Claimable queue: unassigned human-takeover convs on the agent's channels.
        elif params.get('queue') == 'true':
            qs = qs.filter(status='human_takeover', assigned_to__isnull=True)
            if profile:
                channel_ids = list(profile.channels.values_list('id', flat=True))
                if channel_ids:
                    qs = qs.filter(channel_id__in=channel_ids)

        if params.get('status'):
            qs = qs.filter(status=params['status'])
        return qs

    @action(detail=True, methods=['patch'], url_path='update')
    def partial_update_conversation(self, request, pk=None):
        """Allow toggling ai_active and updating status from the Inbox."""
        conversation = self.get_object()
        allowed_fields = {'ai_active', 'status'}
        data = {k: v for k, v in request.data.items() if k in allowed_fields}
        for field, value in data.items():
            setattr(conversation, field, value)
        conversation.save(update_fields=list(data.keys()))
        return Response(ConversationSerializer(conversation).data)

    @action(detail=True, methods=['post'], url_path='claim')
    def claim(self, request, pk=None):
        """An agent takes ownership of an unassigned conversation."""
        from django.utils import timezone
        from accounts.models import SLAAlert
        conversation = self.get_object()
        profile = getattr(request.user, 'agent_profile', None)
        if not profile:
            return Response({'detail': 'Solo un agente puede tomar conversaciones.'},
                            status=status.HTTP_403_FORBIDDEN)
        conversation.assigned_to = profile
        conversation.assigned_at = timezone.now()
        conversation.status = 'human_takeover'
        conversation.ai_active = False
        conversation.save(update_fields=['assigned_to', 'assigned_at', 'status', 'ai_active', 'updated_at'])
        SLAAlert.objects.filter(conversation=conversation, resolved=False).update(
            resolved=True, acknowledged=True, acknowledged_by=profile)
        return Response(ConversationSerializer(conversation).data)

    @action(detail=True, methods=['post'], url_path='release')
    def release(self, request, pk=None):
        """Agent finishes — hand the conversation back to the AI."""
        from accounts.models import SLAAlert
        conversation = self.get_object()
        conversation.assigned_to = None
        conversation.assigned_at = None
        conversation.status = 'active'
        conversation.ai_active = True
        conversation.save(update_fields=['assigned_to', 'assigned_at', 'status', 'ai_active', 'updated_at'])
        SLAAlert.objects.filter(conversation=conversation, resolved=False).update(resolved=True)
        return Response(ConversationSerializer(conversation).data)

    @action(detail=True, methods=['post'], url_path='messages')
    def create_message(self, request, pk=None):
        """Send an agent message from the Inbox. Marks first response for SLA."""
        conversation = self.get_object()
        content = (request.data.get('content') or '').strip()
        if not content:
            return Response({'detail': 'content is required'}, status=status.HTTP_400_BAD_REQUEST)
        msg = Message.objects.create(
            conversation=conversation,
            role='agent',
            content=content,
        )
        # Replying clears any open SLA alert — the customer is no longer waiting.
        from accounts.models import SLAAlert
        SLAAlert.objects.filter(conversation=conversation, resolved=False).update(resolved=True)
        return Response(MessageSerializer(msg).data, status=status.HTTP_201_CREATED)


class MessageViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Message.objects.select_related('conversation').all()
    serializer_class = MessageSerializer
    permission_classes = [IsAuthenticated]
