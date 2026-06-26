"""Operator console API + access-link (invite) flow."""
import pytest
from decimal import Decimal
from django.contrib.auth.models import User
from rest_framework.test import APIClient

from accounts.models import Organization, AccessInvite


@pytest.fixture
def operator(db):
    u = User.objects.create_superuser(username='owner', password='x')
    c = APIClient(); c.force_authenticate(user=u)
    return c


@pytest.mark.django_db
class TestOperatorAccess:
    def test_non_operator_forbidden(self):
        u = User.objects.create_user(username='someone', password='x')
        c = APIClient(); c.force_authenticate(user=u)
        assert c.get('/api/operator/orgs/').status_code == 403

    def test_operator_lists_orgs(self, operator):
        Organization.objects.create(slug='acme', name='Acme')
        r = operator.get('/api/operator/orgs/')
        assert r.status_code == 200
        assert any(o['slug'] == 'acme' for o in r.json())


@pytest.mark.django_db
class TestOperatorProvision:
    def test_create_org_returns_access_link(self, operator):
        r = operator.post('/api/operator/orgs/', {
            'name': 'Beta Corp', 'admin_email': 'admin@beta.mx', 'credits': 10,
        }, format='json')
        assert r.status_code == 201, r.content
        body = r.json()
        assert body['slug'] == 'beta-corp'
        assert Decimal(body['credits_usd']) == Decimal('10')
        assert body['access_link']['token']
        assert body['access_link']['path'].startswith('/activar/')
        # Admin user exists but is inactive until the link is accepted.
        u = User.objects.get(username='admin@beta.mx')
        assert u.is_active is False

    def test_suspend_and_credits(self, operator):
        operator.post('/api/operator/orgs/', {'name': 'Gamma', 'admin_email': 'a@g.mx'}, format='json')
        assert operator.post('/api/operator/orgs/gamma/suspend/').json()['is_active'] is False
        r = operator.post('/api/operator/orgs/gamma/credits/', {'amount_usd': '25'}, format='json')
        assert Decimal(r.json()['credits_usd']) == Decimal('25')


@pytest.mark.django_db
class TestAccessLink:
    def _new_invite(self, operator):
        r = operator.post('/api/operator/orgs/', {'name': 'Delta', 'admin_email': 'admin@delta.mx'}, format='json')
        return r.json()['access_link']['token']

    def test_invite_detail_then_accept(self, operator):
        token = self._new_invite(operator)
        pub = APIClient()
        d = pub.get(f'/api/invite/{token}/')
        assert d.status_code == 200 and d.json()['organization'] == 'Delta'

        a = pub.post(f'/api/invite/{token}/accept/', {'password': 'superseguro1'}, format='json')
        assert a.status_code == 200 and 'access' in a.json()
        User.objects.get(username='admin@delta.mx')  # now active
        assert User.objects.get(username='admin@delta.mx').is_active is True
        # Link is single-use → now gone.
        assert pub.get(f'/api/invite/{token}/').status_code == 410

    def test_short_password_rejected(self, operator):
        token = self._new_invite(operator)
        r = APIClient().post(f'/api/invite/{token}/accept/', {'password': 'x'}, format='json')
        assert r.status_code == 400

    def test_bad_token_gone(self):
        assert APIClient().get('/api/invite/nope/').status_code == 410


@pytest.mark.django_db
class TestSuspensionEnforcement:
    """Suspending an org must actually lock out its users — at login and on every
    API call (defense in depth)."""

    def _make_user_in_org(self, org, username='emp@acme.mx'):
        from accounts.models import Membership, Agent
        u = User.objects.create_user(username=username, password='Sup3rSecret!1')
        Membership.objects.create(user=u, organization=org, role='admin', is_default=True)
        Agent.objects.create(user=u, role='admin', organization=org, display_name='Emp')
        return u

    def test_login_blocked_when_org_suspended(self, org):
        org.is_active = False
        org.save(update_fields=['is_active'])
        self._make_user_in_org(org)
        r = APIClient().post('/api/auth/token/',
                             {'username': 'emp@acme.mx', 'password': 'Sup3rSecret!1'}, format='json')
        assert r.status_code == 400
        assert 'suspendida' in str(r.json()).lower()

    def test_login_works_when_org_active(self, org):
        self._make_user_in_org(org)
        r = APIClient().post('/api/auth/token/',
                             {'username': 'emp@acme.mx', 'password': 'Sup3rSecret!1'}, format='json')
        assert r.status_code == 200
        assert 'access' in r.json()

    def test_api_call_403_when_org_suspended_mid_session(self, org):
        """Token issued while active, org suspended afterwards → API now 403s."""
        u = self._make_user_in_org(org)
        client = APIClient(); client.force_authenticate(user=u)
        assert client.get('/api/conversations/').status_code == 200  # active: ok
        org.is_active = False
        org.save(update_fields=['is_active'])
        r = client.get('/api/conversations/')
        assert r.status_code == 403
        assert 'suspendida' in str(r.json()).lower()


@pytest.mark.django_db
class TestSuperuserIdentity:
    """The operator console only shows for is_superuser. /me must keep that flag
    set even after the superuser has an Agent row (e.g. auto-provisioned on claim)."""

    def test_me_keeps_superuser_flag_with_agent_profile(self, org, operator):
        from accounts.models import Agent
        su = User.objects.get(username='owner')
        Agent.objects.create(user=su, role='agent', organization=org, display_name='Owner')

        body = operator.get('/api/accounts/agents/me/').json()
        assert body['is_superuser'] is True            # operator console stays visible
        assert body['permissions']['manage_agents'] is True  # full powers, not the agent role's
