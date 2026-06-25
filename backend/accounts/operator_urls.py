from django.urls import path
from rest_framework.routers import DefaultRouter

from .operator_views import OperatorOrgViewSet, invite_detail, invite_accept

router = DefaultRouter()
router.register('operator/orgs', OperatorOrgViewSet, basename='operator-org')

urlpatterns = [
    path('invite/<str:token>/', invite_detail, name='invite-detail'),
    path('invite/<str:token>/accept/', invite_accept, name='invite-accept'),
    *router.urls,
]
