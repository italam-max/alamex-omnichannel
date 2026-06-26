"""
Defense-in-depth guards for tenant isolation.

The real isolation boundary is the DRF layer (`TenantScopedViewSet`). Because the
default model manager is intentionally UNSCOPED, a ViewSet over a tenant-owned
model that forgets the mixin would silently serve every tenant's rows. These
tests turn that latent footgun into a build failure, and lock the hardened
`get_solo()` behavior.
"""
import pytest

from accounts.tenancy import TenantOwned, TenantScopedViewSet, TenantContextMissing


def _iter_view_classes(resolver=None):
    """Yield every view class reachable from the root URLconf."""
    from django.urls import get_resolver
    resolver = resolver or get_resolver()
    for pattern in resolver.url_patterns:
        if hasattr(pattern, 'url_patterns'):          # included resolver → recurse
            yield from _iter_view_classes(pattern)
            continue
        cb = pattern.callback
        cls = getattr(cb, 'cls', None) or getattr(cb, 'view_class', None)
        if cls is not None:
            yield cls


# ViewSets that intentionally operate cross-organization. Adding a name here is a
# deliberate, reviewed exception — not the default escape hatch.
CROSS_ORG_ALLOWLIST = set()


def test_every_tenant_model_viewset_is_scoped():
    """Any ViewSet whose queryset model is tenant-owned MUST scope by org."""
    offenders = []
    for cls in set(_iter_view_classes()):
        qs = getattr(cls, 'queryset', None)
        model = getattr(qs, 'model', None)
        if model is None or not issubclass(model, TenantOwned):
            continue
        if issubclass(cls, TenantScopedViewSet):
            continue
        if cls.__name__ in CROSS_ORG_ALLOWLIST:
            continue
        offenders.append(f'{cls.__name__} → {model.__name__}')

    assert not offenders, (
        'ViewSets sobre modelos tenant-owned sin TenantScopedViewSet '
        '(fuga cross-tenant): ' + ', '.join(sorted(offenders))
    )


@pytest.mark.django_db
class TestGetSoloRequiresOrgContext:
    """`get_solo()` must never fall back to another tenant's row."""

    def test_raises_without_org_context(self):
        from billing.models import CreditAccount
        from accounts.tenancy import current_organization
        # Explicitly clear any context bound by the autouse test fixture.
        token = current_organization.set(None)
        try:
            with pytest.raises(TenantContextMissing):
                CreditAccount.get_solo()
        finally:
            current_organization.reset(token)

    def test_resolves_to_current_org(self, org):
        from billing.models import CreditAccount
        from accounts.tenancy import use_organization
        with use_organization(org):
            acc = CreditAccount.get_solo()
        assert acc.organization_id == org.id
