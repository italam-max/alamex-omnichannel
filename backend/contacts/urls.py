from rest_framework.routers import DefaultRouter
from .views import LeadViewSet, FollowUpViewSet

router = DefaultRouter()
router.register('leads', LeadViewSet)
router.register('followups', FollowUpViewSet)

urlpatterns = router.urls
