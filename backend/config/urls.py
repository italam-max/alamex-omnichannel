from django.contrib import admin
from django.urls import path, include
from django.http import JsonResponse
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView


def health_check(request):
    return JsonResponse({"status": "ok"})


urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/health/', health_check, name='health'),
    path('api/auth/token/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/auth/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('api/conversations/', include('conversations.urls')),
    path('api/accounts/', include('accounts.urls')),
    path('api/contacts/', include('contacts.urls')),
    path('api/knowledge/', include('knowledge.urls')),
    path('api/billing/', include('billing.urls')),
    path('api/integrations/', include('integrations.urls')),
]
