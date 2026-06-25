from rest_framework import viewsets, status
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.response import Response

from accounts.permissions import IsAdmin
from .models import KnowledgeDoc, AIConfig, CustomTool, CustomToolRun
from .serializers import (
    KnowledgeDocSerializer, AIConfigSerializer,
    CustomToolSerializer, CustomToolRunSerializer,
)


class KnowledgeDocViewSet(viewsets.ModelViewSet):
    queryset = KnowledgeDoc.objects.all().order_by('order', 'created_at')
    serializer_class = KnowledgeDocSerializer
    permission_classes = [IsAdmin]


class CustomToolViewSet(viewsets.ModelViewSet):
    """CRUD for tenant-defined agent tools, plus the operator review action."""
    queryset = CustomTool.objects.all()
    serializer_class = CustomToolSerializer
    permission_classes = [IsAdmin]

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        """Operator-only: approve an external (webhook) tool so it can activate."""
        if not (request.user.is_staff or request.user.is_superuser):
            return Response({'detail': 'Solo el operador puede aprobar herramientas.'},
                            status=status.HTTP_403_FORBIDDEN)
        tool = self.get_object()
        tool.review_status = CustomTool.STATUS_APPROVED
        tool.save(update_fields=['review_status'])
        return Response(CustomToolSerializer(tool).data)

    @action(detail=True, methods=['get'])
    def runs(self, request, pk=None):
        """Recent invocations of this tool (audit + captured data)."""
        tool = self.get_object()
        qs = tool.runs.all()[:50]
        return Response(CustomToolRunSerializer(qs, many=True).data)


@api_view(['GET', 'PUT', 'PATCH'])
@permission_classes([IsAdmin])
def ai_config_view(request):
    """Singleton — GET returns it, PUT/PATCH updates it (always pk=1)."""
    config = AIConfig.get_solo()

    if request.method == 'GET':
        return Response(AIConfigSerializer(config).data)

    serializer = AIConfigSerializer(config, data=request.data, partial=True)
    if serializer.is_valid():
        serializer.save()
        return Response(AIConfigSerializer(serializer.instance).data)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([IsAdmin])
def scrape_view(request):
    """Scrape a URL and return suggested knowledge documents."""
    url = (request.data.get('url') or '').strip()
    if not url:
        return Response({'error': 'Se requiere una URL'}, status=status.HTTP_400_BAD_REQUEST)

    follow_links = bool(request.data.get('follow_links', False))
    max_pages    = min(max(1, int(request.data.get('max_pages', 5))), 15)
    # Pass the caller's key through as-is; the scraper resolves the '••••••••'
    # sentinel and falls back to the platform key (settings.ANTHROPIC_API_KEY).
    api_key      = (request.data.get('api_key') or '').strip()

    from .services.scraper import scrape_website
    result = scrape_website(url, follow_links=follow_links, max_pages=max_pages, api_key=api_key)
    return Response(result)
