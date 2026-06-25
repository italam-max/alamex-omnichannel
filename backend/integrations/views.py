from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from accounts.tenancy import TenantScopedViewSet
from .models import Integration, Quote
from .serializers import IntegrationSerializer, QuoteSerializer


class IntegrationViewSet(TenantScopedViewSet, viewsets.ReadOnlyModelViewSet):
    queryset = Integration.objects.all()
    serializer_class = IntegrationSerializer
    permission_classes = [IsAuthenticated]


class QuoteViewSet(TenantScopedViewSet, viewsets.ReadOnlyModelViewSet):
    queryset = Quote.objects.select_related('contact', 'conversation').all()
    serializer_class = QuoteSerializer
    permission_classes = [IsAuthenticated]
