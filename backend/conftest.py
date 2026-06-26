"""
Shared pytest fixtures for multi-tenancy.

`_bind_default_org` (autouse) binds a default organization context for any
DB-backed test, so direct ORM creates get stamped via TenantOwned.save(). The
`org`/`org_membership` fixtures expose it for API tests.
"""
import pytest

TEST_ORG_SLUG = 'test-org'


def _get_test_org():
    from accounts.models import Organization
    org, _ = Organization.objects.get_or_create(
        slug=TEST_ORG_SLUG, defaults={'name': 'Test Org'})
    return org


@pytest.fixture(autouse=True)
def _bind_default_org(request):
    """Bind a default org for DB tests so created rows are stamped."""
    uses_db = (
        'db' in request.fixturenames
        or 'transactional_db' in request.fixturenames
        or request.node.get_closest_marker('django_db') is not None
    )
    if not uses_db:
        yield None
        return
    from accounts.tenancy import current_organization
    org = _get_test_org()
    token = current_organization.set(org)
    try:
        yield org
    finally:
        current_organization.reset(token)


@pytest.fixture
def org(db):
    return _get_test_org()


def membership_for(user, org=None, role='admin'):
    """Give a user a membership so request-time org resolution works."""
    from accounts.models import Membership
    org = org or _get_test_org()
    m, _ = Membership.objects.get_or_create(
        user=user, organization=org, defaults={'role': role, 'is_default': True})
    return m
