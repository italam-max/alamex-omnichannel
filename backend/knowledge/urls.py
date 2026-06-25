from django.urls import path
from rest_framework.routers import DefaultRouter
from .views import KnowledgeDocViewSet, CustomToolViewSet, ai_config_view, scrape_view

router = DefaultRouter()
router.register('docs', KnowledgeDocViewSet)
router.register('tools', CustomToolViewSet)

urlpatterns = [
    path('config/', ai_config_view, name='ai-config'),
    path('scrape/', scrape_view, name='knowledge-scrape'),
    *router.urls,
]
