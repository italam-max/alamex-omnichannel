from django.urls import path
from rest_framework.routers import DefaultRouter
from .views import KnowledgeDocViewSet, ai_config_view

router = DefaultRouter()
router.register('docs', KnowledgeDocViewSet)

urlpatterns = [
    path('config/', ai_config_view, name='ai-config'),
    *router.urls,
]
