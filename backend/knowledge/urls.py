from rest_framework.routers import DefaultRouter
from .views import KnowledgeDocViewSet

router = DefaultRouter()
router.register('docs', KnowledgeDocViewSet)

urlpatterns = router.urls
