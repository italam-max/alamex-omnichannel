from datetime import timedelta

import pytest
from django.contrib.auth.models import User
from django.core import mail
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import Agent, SLAAlert, Workspace
from conversations.models import Channel, Contact, Conversation, Message


# ── Fixtures ──────────────────────────────────────────────────────

@pytest.fixture
def admin_client(db):
    user = User.objects.create_user(username='admin@x.mx', password='p')
    Agent.objects.create(user=user, role=Agent.ROLE_ADMIN, display_name='Admin')
    c = APIClient()
    c.force_authenticate(user=user)
    return c


@pytest.fixture
def agent_client(db):
    user = User.objects.create_user(username='agent@x.mx', password='p')
    Agent.objects.create(user=user, role=Agent.ROLE_AGENT, display_name='Agente')
    c = APIClient()
    c.force_authenticate(user=user)
    return c


@pytest.fixture
def channel(db):
    return Channel.objects.create(name='Web', type='website', is_active=True)


# ── Workspace business rules ──────────────────────────────────────

@pytest.mark.django_db
class TestWorkspace:
    def test_solo_creates_singleton(self):
        a = Workspace.get_solo()
        b = Workspace.get_solo()
        assert a.pk == b.pk == 1

    def test_tier_thresholds_are_used(self):
        ws = Workspace.get_solo()
        ws.sla_warning_minutes, ws.sla_critical_minutes, ws.sla_escalate_minutes = 10, 15, 20
        ws.save()
        assert ws.tier_for_wait(5) == 'ok'
        assert ws.tier_for_wait(12) == 'warning'
        assert ws.tier_for_wait(18) == 'critical'
        assert ws.tier_for_wait(25) == 'escalated'

    def test_admin_can_update_rules(self, admin_client):
        r = admin_client.patch('/api/accounts/workspace/update/', {
            'sla_warning_minutes': 10, 'sla_critical_minutes': 15,
            'sla_escalate_minutes': 20, 'escalation_email': 'a@b.mx',
        }, format='json')
        assert r.status_code == 200
        assert Workspace.get_solo().sla_escalate_minutes == 20

    def test_thresholds_must_be_increasing(self, admin_client):
        r = admin_client.patch('/api/accounts/workspace/update/', {
            'sla_warning_minutes': 20, 'sla_critical_minutes': 10, 'sla_escalate_minutes': 15,
        }, format='json')
        assert r.status_code == 400

    def test_agent_cannot_update_rules(self, agent_client):
        r = agent_client.patch('/api/accounts/workspace/update/',
                               {'sla_warning_minutes': 99}, format='json')
        assert r.status_code == 403


# ── Agent management ──────────────────────────────────────────────

@pytest.mark.django_db
class TestAgents:
    def test_admin_creates_agent_with_login(self, admin_client, channel):
        r = admin_client.post('/api/accounts/agents/', {
            'display_name': 'Ana García', 'new_email': 'ana@x.mx',
            'new_password': 'Sup3rPass!', 'role': 'agent', 'channel_ids': [channel.id],
        }, format='json')
        assert r.status_code == 201
        assert User.objects.filter(username='ana@x.mx').exists()
        agent = Agent.objects.get(user__username='ana@x.mx')
        assert list(agent.channels.all()) == [channel]

    def test_agent_cannot_create_agent(self, agent_client):
        r = agent_client.post('/api/accounts/agents/', {
            'display_name': 'X', 'new_email': 'x@x.mx', 'new_password': 'Sup3rPass!',
        }, format='json')
        assert r.status_code == 403

    def test_deactivate_is_soft_delete(self, admin_client):
        user = User.objects.create_user(username='b@x.mx', password='p')
        agent = Agent.objects.create(user=user, role=Agent.ROLE_AGENT)
        r = admin_client.delete(f'/api/accounts/agents/{agent.id}/')
        assert r.status_code == 204
        agent.refresh_from_db(); user.refresh_from_db()
        assert agent.is_active is False
        assert user.is_active is False  # cannot log in

    def test_reactivate(self, admin_client):
        user = User.objects.create_user(username='c@x.mx', password='p', is_active=False)
        agent = Agent.objects.create(user=user, role=Agent.ROLE_AGENT, is_active=False)
        r = admin_client.post(f'/api/accounts/agents/{agent.id}/reactivate/')
        assert r.status_code == 200
        agent.refresh_from_db()
        assert agent.is_active is True

    def test_permissions_map_by_role(self):
        u = User.objects.create_user(username='d@x.mx', password='p')
        admin = Agent.objects.create(user=u, role=Agent.ROLE_ADMIN)
        assert admin.permissions['manage_agents'] is True
        u2 = User.objects.create_user(username='e@x.mx', password='p')
        agent = Agent.objects.create(user=u2, role=Agent.ROLE_AGENT)
        assert agent.permissions['manage_agents'] is False
        assert agent.permissions['attend_convs'] is True


# ── SLA escalation engine ─────────────────────────────────────────

@pytest.mark.django_db
class TestSlaEngine:
    def _waiting_conv(self, minutes_ago):
        ch = Channel.objects.create(name='Web', type='website')
        contact = Contact.objects.create(name='Cliente', channel=ch)
        conv = Conversation.objects.create(channel=ch, contact=contact, status='human_takeover')
        m = Message.objects.create(conversation=conv, role='customer', content='Hola?')
        Message.objects.filter(pk=m.pk).update(
            created_at=timezone.now() - timedelta(minutes=minutes_ago))
        return conv

    def test_escalation_creates_alert_and_email(self):
        ws = Workspace.get_solo()
        ws.sla_warning_minutes, ws.sla_critical_minutes, ws.sla_escalate_minutes = 5, 10, 15
        ws.escalation_enabled = True
        ws.escalation_email = 'alertas@x.mx'
        ws.save()

        conv = self._waiting_conv(20)  # past the 15-min escalate threshold
        from accounts.services import scan_sla
        summary = scan_sla()

        assert summary['escalated'] == 1
        alert = SLAAlert.objects.get(conversation=conv, level='escalated')
        assert alert.email_sent is True
        assert len(mail.outbox) == 1
        assert 'alertas@x.mx' in mail.outbox[0].to

    def test_scan_is_idempotent(self):
        ws = Workspace.get_solo()
        ws.escalation_email = 'a@x.mx'; ws.save()
        self._waiting_conv(20)
        from accounts.services import scan_sla
        scan_sla(); scan_sla()  # twice
        assert SLAAlert.objects.filter(level='escalated').count() == 1
        assert len(mail.outbox) == 1  # email sent only once

    def test_agent_reply_stops_the_clock(self):
        conv = self._waiting_conv(20)
        Message.objects.create(conversation=conv, role='agent', content='Te ayudo')
        from accounts.services import conversation_wait_minutes
        assert conversation_wait_minutes(conv) == 0


# ── Reassignment ──────────────────────────────────────────────────

@pytest.mark.django_db
class TestAgentWorkspace:
    def _agent_with_client(self, username, channel=None):
        user = User.objects.create_user(username=username, password='p')
        agent = Agent.objects.create(user=user, role=Agent.ROLE_AGENT, display_name=username)
        if channel:
            agent.channels.add(channel)
        c = APIClient(); c.force_authenticate(user=user)
        return agent, c

    def _conv(self, channel, status='human_takeover', assigned_to=None):
        contact = Contact.objects.create(name='C', channel=channel)
        return Conversation.objects.create(channel=channel, contact=contact,
                                           status=status, assigned_to=assigned_to)

    def test_assigned_me_returns_only_my_convs(self, channel):
        agent, client = self._agent_with_client('a1@x.mx', channel)
        other, _ = self._agent_with_client('a2@x.mx', channel)
        mine = self._conv(channel, assigned_to=agent)
        self._conv(channel, assigned_to=other)
        r = client.get('/api/conversations/?assigned=me')
        ids = [c['id'] for c in (r.data.get('results') or r.data)]
        assert ids == [mine.id]

    def test_queue_shows_unassigned_on_my_channels(self, channel):
        agent, client = self._agent_with_client('a3@x.mx', channel)
        other_ch = Channel.objects.create(name='Other', type='whatsapp')
        q = self._conv(channel, assigned_to=None)          # in my channel, unassigned
        self._conv(other_ch, assigned_to=None)             # other channel → excluded
        self._conv(channel, assigned_to=agent)             # already mine → excluded
        r = client.get('/api/conversations/?queue=true')
        ids = [c['id'] for c in (r.data.get('results') or r.data)]
        assert ids == [q.id]

    def test_claim_assigns_to_me(self, channel):
        agent, client = self._agent_with_client('a4@x.mx', channel)
        conv = self._conv(channel, assigned_to=None)
        SLAAlert.objects.create(conversation=conv, level='escalated', wait_minutes=20)
        r = client.post(f'/api/conversations/{conv.id}/claim/')
        assert r.status_code == 200
        conv.refresh_from_db()
        assert conv.assigned_to_id == agent.id
        assert conv.ai_active is False
        assert SLAAlert.objects.filter(conversation=conv, resolved=False).count() == 0

    def test_release_returns_to_ai(self, channel):
        agent, client = self._agent_with_client('a5@x.mx', channel)
        conv = self._conv(channel, assigned_to=agent)
        r = client.post(f'/api/conversations/{conv.id}/release/')
        assert r.status_code == 200
        conv.refresh_from_db()
        assert conv.assigned_to is None
        assert conv.status == 'active'
        assert conv.ai_active is True

    def test_my_followups_filter(self, channel):
        agent, client = self._agent_with_client('a6@x.mx', channel)
        mine = self._conv(channel, assigned_to=agent)
        other_agent, _ = self._agent_with_client('a7@x.mx', channel)
        theirs = self._conv(channel, assigned_to=other_agent)
        from contacts.models import FollowUp
        f1 = FollowUp.objects.create(conversation=mine, reason='r', priority='high')
        FollowUp.objects.create(conversation=theirs, reason='r', priority='high')
        r = client.get('/api/contacts/followups/?mine=true')
        ids = [f['id'] for f in (r.data.get('results') or r.data)]
        assert ids == [f1.id]


@pytest.mark.django_db
class TestReassign:
    def test_reassign_assigns_and_resolves_alerts(self, admin_client):
        ch = Channel.objects.create(name='Web', type='website')
        contact = Contact.objects.create(name='C', channel=ch)
        conv = Conversation.objects.create(channel=ch, contact=contact, status='human_takeover')
        SLAAlert.objects.create(conversation=conv, level='escalated', wait_minutes=20)
        user = User.objects.create_user(username='ag@x.mx', password='p')
        agent = Agent.objects.create(user=user, role=Agent.ROLE_AGENT)

        r = admin_client.post('/api/accounts/reassign/',
                              {'conversation': conv.id, 'agent': agent.id}, format='json')
        assert r.status_code == 200
        conv.refresh_from_db()
        assert conv.assigned_to_id == agent.id
        assert conv.assigned_at is not None
        assert SLAAlert.objects.filter(conversation=conv, resolved=False).count() == 0
