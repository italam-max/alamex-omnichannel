"""JWT login that enforces organization suspension.

A user whose organization has been suspended (`is_active=False`) must not be able
to obtain a token. Superusers (platform operators) are exempt — they manage the
suspended orgs from the operator console."""
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.views import TokenObtainPairView

from .models import Membership


class TenantTokenObtainPairSerializer(TokenObtainPairSerializer):
    def validate(self, attrs):
        data = super().validate(attrs)  # validates credentials → sets self.user
        user = self.user
        if not user.is_superuser:
            memberships = Membership.objects.filter(user=user)
            # Has membership(s) but none to an active org → suspended, deny.
            if memberships.exists() and not memberships.filter(
                    organization__is_active=True).exists():
                raise serializers.ValidationError(
                    {'detail': 'Tu organización está suspendida. '
                               'Contacta al administrador de la plataforma.'},
                    code='org_suspended')
        return data


class TenantTokenObtainPairView(TokenObtainPairView):
    serializer_class = TenantTokenObtainPairSerializer
