from rest_framework.routers import DefaultRouter
from .views import IntegrationViewSet, QuoteViewSet

router = DefaultRouter()
router.register('integrations', IntegrationViewSet)
router.register('quotes', QuoteViewSet)

urlpatterns = router.urls
