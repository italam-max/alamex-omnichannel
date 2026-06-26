"""
Multi-tenancy primitives (shared schema, row-level).

Design (see plan): every tenant-owned model inherits `TenantOwned` (an
`organization` FK). The default `objects` manager stays UNSCOPED so migrations,
the admin, related-manager traversal and per-org background jobs keep working.
The `tenant` manager auto-scopes to `current_organization` and fails loudly if
no org is set. The real, auditable security boundary is the DRF layer
(`TenantScopedViewSet`), which filters by `request.organization` explicitly.

This module must not import other apps' models (uses string FK refs).
"""
import contextlib
import contextvars

from django.db import models

# The organization active for the current request / pipeline run.
current_organization = contextvars.ContextVar('current_organization', default=None)


class TenantContextMissing(RuntimeError):
    """Raised when the `tenant` manager is used without a current organization."""


def get_current_organization():
    return current_organization.get()


@contextlib.contextmanager
def use_organization(org):
    """Bind the current organization for the duration of a block (agent/jobs)."""
    token = current_organization.set(org)
    try:
        yield
    finally:
        current_organization.reset(token)


class TenantManager(models.Manager):
    """Auto-scopes to the current organization; never returns global rows by
    accident. Use `objects` for unscoped access (migrations, admin, jobs)."""

    def get_queryset(self):
        org = current_organization.get()
        if org is None:
            raise TenantContextMissing(
                f'{self.model.__name__}.tenant used without a current organization. '
                'Use .objects for unscoped access or set the org context.'
            )
        return super().get_queryset().filter(organization=org)


class TenantOwned(models.Model):
    """Abstract base: an organization-scoped row.

    `organization` is required (NOT NULL after M3); save() auto-stamps it from
    the current org context when not set explicitly."""
    organization = models.ForeignKey(
        'accounts.Organization', on_delete=models.CASCADE, related_name='+',
        db_index=True,
    )

    # `objects` first → stays the default manager (unscoped). `tenant` opt-in.
    objects = models.Manager()
    tenant = TenantManager()

    class Meta:
        abstract = True

    def save(self, *args, **kwargs):
        # Auto-stamp the current organization when none was set explicitly.
        # Views/webhook/widget set it explicitly; this covers deep pipeline
        # creates (leads, follow-ups, messages, tool runs) and tests.
        if self.organization_id is None:
            org = current_organization.get()
            if org is not None:
                self.organization = org
        super().save(*args, **kwargs)


# ── Tenant resolution (DRF layer) ─────────────────────────────────
# JWT auth runs at the DRF view (not in middleware), so the organization is
# resolved from the authenticated user here, where request.user is reliable.

def org_for_request(request):
    """Resolve the organization for an authenticated request.

    One user = one organization (current product rule). A superuser may target
    a specific org with the `X-Organization: <slug>` header (operator support).

    A SUSPENDED organization (`is_active=False`) never resolves: only active
    memberships are considered, and a user whose org has been suspended gets an
    explicit 403 (not silently-empty data) — this is the defense-in-depth half of
    suspension enforcement; the login view blocks them at the door as well."""
    user = getattr(request, 'user', None)
    if not user or not user.is_authenticated:
        return None

    from accounts.models import Membership, Organization

    slug = request.headers.get('X-Organization')
    if slug:
        if user.is_superuser or Membership.objects.filter(user=user, organization__slug=slug).exists():
            org = Organization.objects.filter(slug=slug, is_active=True).first()
            if org:
                return org

    memberships = Membership.objects.filter(user=user).select_related('organization')
    active = memberships.filter(organization__is_active=True).order_by('-is_default', 'id').first()
    if active:
        return active.organization
    # The user belongs to an org, but it's suspended → block explicitly and
    # uniformly across every endpoint (DRF turns this into a clean 403).
    if memberships.exists():
        from rest_framework.exceptions import PermissionDenied
        raise PermissionDenied(
            'Tu organización está suspendida. Contacta al administrador de la plataforma.')
    # No membership at all → fail closed (sees nothing). In production the
    # context is unset here; test setup binds a default org via this fallback.
    return current_organization.get()


class TenantScopedViewSet:
    """Mixin for ModelViewSets: scope reads to the request's organization and
    stamp it on create. ViewSets with a custom get_queryset should wrap their
    queryset with `self.scope_to_org(qs)` instead of inheriting get_queryset."""

    @property
    def organization(self):
        org = getattr(self.request, '_organization', None)
        if org is None:
            org = org_for_request(self.request)
            self.request._organization = org
        return org

    def initial(self, request, *args, **kwargs):
        # Runs after DRF authentication, so request.user is reliable here.
        super().initial(request, *args, **kwargs)
        self._org_token = current_organization.set(self.organization)

    def finalize_response(self, request, response, *args, **kwargs):
        response = super().finalize_response(request, response, *args, **kwargs)
        token = getattr(self, '_org_token', None)
        if token is not None:
            current_organization.reset(token)
            self._org_token = None
        return response

    def scope_to_org(self, qs):
        org = self.organization
        if org is None:
            return qs.none()
        return qs.filter(organization=org)

    def get_queryset(self):
        return self.scope_to_org(super().get_queryset())

    def perform_create(self, serializer):
        serializer.save(organization=self.organization)
