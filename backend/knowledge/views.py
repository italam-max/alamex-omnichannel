from rest_framework import viewsets, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import KnowledgeDoc, AIConfig
from .serializers import KnowledgeDocSerializer, AIConfigSerializer


class KnowledgeDocViewSet(viewsets.ModelViewSet):
    queryset = KnowledgeDoc.objects.all().order_by('order', 'created_at')
    serializer_class = KnowledgeDocSerializer
    permission_classes = [IsAuthenticated]


@api_view(['GET', 'PUT', 'PATCH'])
@permission_classes([IsAuthenticated])
def ai_config_view(request):
    """Singleton — GET returns it, PUT/PATCH updates it (always pk=1)."""
    config = AIConfig.get_solo()

    if request.method == 'GET':
        return Response(AIConfigSerializer(config).data)

    serializer = AIConfigSerializer(config, data=request.data, partial=True)
    if serializer.is_valid():
        serializer.save()
        return Response(serializer.data)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
