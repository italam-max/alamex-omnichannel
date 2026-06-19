from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from .models import KnowledgeDoc
from .serializers import KnowledgeDocSerializer


class KnowledgeDocViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = KnowledgeDoc.objects.filter(is_active=True)
    serializer_class = KnowledgeDocSerializer
    permission_classes = [IsAuthenticated]
