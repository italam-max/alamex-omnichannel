from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.db import connection
from django.http import JsonResponse
from rest_framework_simplejwt.views import TokenRefreshView

from accounts.auth import TenantTokenObtainPairView


def health_check(request):
    """Liveness/readiness probe — verifies DB connectivity (503 if down)."""
    db_ok = True
    try:
        with connection.cursor() as cur:
            cur.execute('SELECT 1')
            cur.fetchone()
    except Exception:
        db_ok = False

    payload = {
        'status': 'ok' if db_ok else 'degraded',
        'database': 'up' if db_ok else 'down',
        'ai_configured': bool(getattr(settings, 'ANTHROPIC_API_KEY', '')),
    }
    return JsonResponse(payload, status=200 if db_ok else 503)


urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/health/', health_check, name='health'),
    path('api/auth/token/', TenantTokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/auth/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('api/', include('accounts.operator_urls')),
    path('api/conversations/', include('conversations.urls')),
    path('api/accounts/', include('accounts.urls')),
    path('api/contacts/', include('contacts.urls')),
    path('api/knowledge/', include('knowledge.urls')),
    path('api/billing/', include('billing.urls')),
    path('api/integrations/', include('integrations.urls')),
]
