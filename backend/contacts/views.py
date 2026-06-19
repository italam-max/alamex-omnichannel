from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from .models import Lead, FollowUp
from .serializers import LeadSerializer, FollowUpSerializer


class LeadViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Lead.objects.select_related('contact').all()
    serializer_class = LeadSerializer
    permission_classes = [IsAuthenticated]


class FollowUpViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = FollowUp.objects.select_related('conversation').all()
    serializer_class = FollowUpSerializer
    permission_classes = [IsAuthenticated]
