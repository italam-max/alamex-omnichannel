from rest_framework.routers import DefaultRouter
from django.urls import path
from .views import IntegrationViewSet, QuoteViewSet
from .webhooks import MetaWebhookView
from .widget import WidgetConfigView, WidgetMessageView

router = DefaultRouter()
router.register('integrations', IntegrationViewSet)
router.register('quotes', QuoteViewSet)

urlpatterns = router.urls + [
    path('webhook/meta/', MetaWebhookView.as_view(), name='meta_webhook'),
    path('widget/<str:widget_key>/config/', WidgetConfigView.as_view(), name='widget_config'),
    path('widget/<str:widget_key>/message/', WidgetMessageView.as_view(), name='widget_message'),
]
