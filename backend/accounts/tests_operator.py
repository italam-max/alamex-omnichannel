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
