from rest_framework.routers import DefaultRouter

from .views import (
    AgentViewSet, SLAAlertViewSet, WorkspaceViewSet,
    ReassignView, TeamStatsView,
)

router = DefaultRouter()
router.register('agents', AgentViewSet, basename='agent')
router.register('alerts', SLAAlertViewSet, basename='slaalert')
router.register('workspace', WorkspaceViewSet, basename='workspace')
router.register('reassign', ReassignView, basename='reassign')
router.register('stats', TeamStatsView, basename='teamstats')

urlpatterns = router.urls
