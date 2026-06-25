from rest_framework import viewsets, status as drf_status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from .models import Lead, FollowUp
from .serializers import LeadSerializer, FollowUpSerializer


class LeadViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Lead.objects.select_related('contact').all()
    serializer_class = LeadSerializer
    permission_classes = [IsAuthenticated]


class FollowUpViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = FollowUp.objects.select_related('conversation', 'conversation__assigned_to').order_by('-created_at')
    serializer_class = FollowUpSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = super().get_queryset()
        params = self.request.query_params
        # Agent workspace: only follow-ups on conversations assigned to me.
        if params.get('mine') == 'true':
            profile = getattr(self.request.user, 'agent_profile', None)
            qs = qs.filter(conversation__assigned_to=profile) if profile else qs.none()
        statuses = params.getlist('status')
        if statuses:
            qs = qs.filter(status__in=statuses)
        return qs

    @action(detail=True, methods=['patch'], url_path='set-status')
    def set_status(self, request, pk=None):
        """Update a follow-up's status (open / in_progress / done / dismissed)."""
        followup = self.get_object()
        new_status = request.data.get('status')
        valid = {c[0] for c in FollowUp.STATUS_CHOICES}
        if new_status not in valid:
            return Response({'detail': 'status inválido'}, status=drf_status.HTTP_400_BAD_REQUEST)
        followup.status = new_status
        followup.save(update_fields=['status'])
        return Response(FollowUpSerializer(followup).data)
