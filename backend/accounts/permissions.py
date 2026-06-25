from rest_framework.permissions import BasePermission, SAFE_METHODS

from .models import Agent


def _role(request):
    user = request.user
    if not user or not user.is_authenticated:
        return None
    if user.is_superuser:
        return Agent.ROLE_ADMIN
    profile = getattr(user, 'agent_profile', None)
    return profile.role if profile else None


class IsAdmin(BasePermission):
    """Only admins (or Django superusers) may write."""
    message = 'Requiere rol de administrador.'

    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return request.user and request.user.is_authenticated
        return _role(request) == Agent.ROLE_ADMIN


class IsAdminStrict(BasePermission):
    """Admins/superusers only — for ALL methods, including reads (e.g. billing)."""
    message = 'Requiere rol de administrador.'

    def has_permission(self, request, view):
        return _role(request) == Agent.ROLE_ADMIN


class IsSupervisorOrAdmin(BasePermission):
    message = 'Requiere rol de supervisor o administrador.'

    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return request.user and request.user.is_authenticated
        return _role(request) in (Agent.ROLE_ADMIN, Agent.ROLE_SUPERVISOR)
