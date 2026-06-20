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
        return Response(AIConfigSerializer(serializer.instance).data)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def scrape_view(request):
    """Scrape a URL and return suggested knowledge documents."""
    url = (request.data.get('url') or '').strip()
    if not url:
        return Response({'error': 'Se requiere una URL'}, status=status.HTTP_400_BAD_REQUEST)

    follow_links = bool(request.data.get('follow_links', False))
    max_pages    = min(max(1, int(request.data.get('max_pages', 5))), 15)
    api_key      = (request.data.get('api_key') or '').strip()

    # If caller sends '••••••••' use the stored global key
    if api_key == '••••••••' or api_key == '':
        config = AIConfig.get_solo()
        api_key = config.ai_api_key or ''

    from .services.scraper import scrape_website
    result = scrape_website(url, follow_links=follow_links, max_pages=max_pages, api_key=api_key)
    return Response(result)
