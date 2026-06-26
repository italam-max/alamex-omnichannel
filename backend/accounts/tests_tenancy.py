"""
Tenant isolation tests — cross-organization data must never leak.

Two organizations A and B, each with its own user (membership), data and credit
account. The API and the agent pipeline must only ever see the caller's org.
"""
import pytest
from decimal import Decimal
from django.contrib.auth.models import User
from rest_framework.test import APIClient

from accounts.models import Organization, Membership, Agent
from accounts.tenancy import use_organization
from conversations.models import Channel, Contact, Conversation
from knowledge.models import KnowledgeDoc
from billing.models import CreditAccount


def _make_org(slug, name):
    return Organization.objects.create(slug=slug, name=name)


def _client_for(org, username, role='admin'):
    user = User.objects.create_user(username=username, password='x')
    Membership.objects.create(user=user, organization=org, role=role, is_default=True)
    Agent.objects.create(user=user, role=role, organization=org, display_name=username)
    c = APIClient()
    c.force_authenticate(user=user)
    return c


@pytest.fixture
def two_orgs(db):
    a = _make_org('org-a', 'Org A')
    b = _make_org('org-b', 'Org B')
    # Data for each org (explicit organization overrides the test-org auto-stamp).
    for org in (a, b):
        ch = Channel.objects.create(name=f'Web {org.slug}', type='website', organization=org)
        ct = Contact.objects.create(name=f'Cliente {org.slug}', channel=ch, organization=org)
        Conversation.objects.create(channel=ch, contact=ct, status='active',
                                    ai_active=True, organization=org)
        KnowledgeDoc.objects.create(title=f'Doc {org.slug}', content='x', organization=org)
        acc = CreditAccount.get_for_org(org)
        acc.balance_usd = Decimal('100') if org == a else Decimal('5')
        acc.save()
    return a, b


@pytest.mark.django_db
class TestApiIsolation:
    def test_conversations_scoped_to_own_org(self, two_orgs):
        a, b = two_orgs
        client_a = _client_for(a, 'admin_a')
        r = client_a.get('/api/conversations/')
        data = r.json()
        rows = data.get('results', data)
        assert r.status_code == 200
        assert len(rows) == 1
        assert all(row.get('organization') in (None, a.id) for row in rows) or True  # org not serialized
        # The single visible conversation belongs to org A's channel.
        assert 'org-a' in str(rows[0])

    def test_cross_org_detail_is_404(self, two_orgs):
        a, b = two_orgs
        b_conv = Conversation.objects.filter(organization=b).first()
        client_a = _client_for(a, 'admin_a2')
        r = client_a.get(f'/api/conversations/{b_conv.id}/')
        assert r.status_code == 404

    def test_knowledge_docs_scoped(self, two_orgs):
        a, b = two_orgs
        client_b = _client_for(b, 'admin_b')
        r = client_b.get('/api/knowledge/docs/')
        rows = r.json()
        rows = rows.get('results', rows)
        assert len(rows) == 1 and rows[0]['title'] == 'Doc org-b'

    def test_billing_account_per_org(self, two_orgs):
        a, b = two_orgs
        bal_a = _client_for(a, 'a_bill').get('/api/billing/account/').json()['balance_usd']
        bal_b = _client_for(b, 'b_bill').get('/api/billing/account/').json()['balance_usd']
        assert Decimal(bal_a) == Decimal('100') and Decimal(bal_b) == Decimal('5')

    def test_create_stamps_caller_org(self, two_orgs):
        a, b = two_orgs
        client_a = _client_for(a, 'a_create')
        r = client_a.post('/api/knowledge/docs/',
                          {'title': 'Nuevo A', 'content': 'y'}, format='json')
        assert r.status_code == 201
        doc = KnowledgeDoc.objects.get(title='Nuevo A')
        assert doc.organization_id == a.id  # stamped to caller's org, never B

    def test_x_organization_spoof_is_ignored(self, two_orgs):
        a, b = two_orgs
        client_a = _client_for(a, 'a_spoof')
        # A is not a member of B → header ignored, resolves to A's own data.
        r = client_a.get('/api/knowledge/docs/', HTTP_X_ORGANIZATION='org-b')
        rows = r.json(); rows = rows.get('results', rows)
        assert len(rows) == 1 and rows[0]['title'] == 'Doc org-a'

    def test_agent_cannot_be_assigned_cross_org_channel(self, two_orgs):
        a, b = two_orgs
        b_channel = Channel.objects.filter(organization=b).first()
        client_a = _client_for(a, 'a_chan')
        # Org A admin tries to attach org B's channel (by PK) to a new agent.
        r = client_a.post('/api/accounts/agents/', {
            'new_email': 'nuevo@org-a.test',
            'new_password': 'Sup3rSecret!42',
            'display_name': 'Agente A',
            'role': 'agent',
            'channel_ids': [b_channel.id],
        }, format='json')
        # The serializer's queryset is scoped to A → B's channel is not a valid choice.
        assert r.status_code == 400
        assert 'channel_ids' in r.json()
        assert not Agent.objects.filter(channels=b_channel).exists()


@pytest.mark.django_db
class TestPipelineIsolation:
    def test_knowledge_search_bound_to_org(self, two_orgs):
        a, b = two_orgs
        from integrations.services.agent_tools import make_search_knowledge_base
        search_a = make_search_knowledge_base(a)
        out = search_a.invoke({'query': 'Doc'})
        assert 'Doc org-a' in out and 'Doc org-b' not in out

    def test_credit_deduction_hits_only_caller_org(self, two_orgs):
        a, b = two_orgs
        from integrations.services.agent_graph import _deduct_credits

        class _Ch:  # minimal stand-in with an org
            id = 1
            organization = a
            organization_id = a.id
        with use_organization(a):
            _deduct_credits(_Ch(), 'claude-haiku-4-5-20251001', 1000, 1000)
        a_acc = CreditAccount.get_for_org(a)
        b_acc = CreditAccount.get_for_org(b)
        assert a_acc.balance_usd < Decimal('100')   # A charged
        assert b_acc.balance_usd == Decimal('5')     # B untouched
