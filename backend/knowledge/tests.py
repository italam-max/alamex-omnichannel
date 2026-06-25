"""Tests for tenant-defined custom tools: dispatch, SSRF guard, API guardrails."""
from unittest.mock import patch

import pytest
from django.contrib.auth.models import User
from rest_framework.test import APIClient

from accounts.models import Workspace
from knowledge.models import CustomTool, CustomToolRun
from integrations.services import custom_tools as ct


# ── scrape_view regression (C1: removed ai_api_key field) ─────────

@pytest.mark.django_db
class TestScrapeView:
    def test_blank_api_key_does_not_crash(self, db):
        """Regression: scrape_view referenced AIConfig.ai_api_key (removed in
        migration 0004) and raised AttributeError on the blank-key path."""
        user = User.objects.create_superuser(username='u', password='x')
        client = APIClient(); client.force_authenticate(user=user)
        with patch('knowledge.services.scraper.scrape_website',
                   return_value={'documents': [], 'pages_scraped': 0}) as m:
            r = client.post('/api/knowledge/scrape/', {'url': 'https://example.com'}, format='json')
        assert r.status_code == 200, r.content
        # Caller's (blank) key is passed through untouched — no AIConfig lookup.
        assert m.call_args.kwargs['api_key'] == ''


@pytest.fixture
def api_client(db):
    user = User.objects.create_superuser(username='op', password='x')
    client = APIClient()
    client.force_authenticate(user=user)
    return client


# ── Service: dispatch + tool generation ──────────────────────────

@pytest.mark.django_db
class TestCustomToolDispatch:
    def test_build_generates_active_tools_only(self):
        CustomTool.objects.create(name='activa', description='d', archetype='collect_data', is_active=True)
        CustomTool.objects.create(name='inactiva', description='d', archetype='collect_data', is_active=False)
        names = [t.name for t in ct.build_custom_tools()]
        assert names == ['activa']

    def test_collect_data_logs_run_and_returns_confirmation(self):
        tool = CustomTool.objects.create(
            name='agendar_visita', description='Agenda visita', archetype='collect_data',
            parameters=[{'name': 'fecha', 'type': 'string', 'required': True}], is_active=True)
        ct.current_conversation_id.set(None)
        result = ct._dispatch(tool, {'fecha': 'martes'})
        assert 'registrados' in result
        run = CustomToolRun.objects.get(tool=tool)
        assert run.status == 'ok'
        assert run.arguments == {'fecha': 'martes'}

    def test_canned_response_returns_text(self):
        tool = CustomTool.objects.create(
            name='politica_envios', description='d', archetype='canned_response',
            config={'text': 'Enviamos en 3 días.'}, is_active=True)
        assert ct._dispatch(tool, {}) == 'Enviamos en 3 días.'

    def test_tag_route_escalates_when_configured(self, db):
        from conversations.models import Channel, Contact, Conversation
        ch = Channel.objects.create(name='c', type='website')
        contact = Contact.objects.create(name='x', channel=ch)
        conv = Conversation.objects.create(channel=ch, contact=contact, status='active', ai_active=True)
        tool = CustomTool.objects.create(
            name='escalar_legal', description='d', archetype='tag_route',
            config={'tag': 'legal', 'escalate': True}, is_active=True)
        ct.current_conversation_id.set(conv.id)
        ct._dispatch(tool, {})
        conv.refresh_from_db()
        assert conv.status == 'human_takeover'
        assert conv.ai_active is False


# ── Service: SSRF guard ───────────────────────────────────────────

@pytest.mark.django_db
class TestWebhookSSRFGuard:
    @pytest.mark.parametrize('url', [
        'http://example.com',            # not https
        'https://127.0.0.1/x',           # loopback
        'https://192.168.0.10/x',        # private
        'https://169.254.169.254/meta',  # link-local (cloud metadata)
        'https://10.0.0.5/x',            # private
    ])
    def test_blocks_unsafe_targets(self, url):
        with pytest.raises(ct._ToolError):
            ct._validate_webhook_target(url, '')

    def test_allowlist_blocks_other_domains(self):
        with pytest.raises(ct._ToolError):
            ct._validate_webhook_target('https://evil.com/x', 'miempresa.com')


# ── API: guardrails ───────────────────────────────────────────────

@pytest.mark.django_db
class TestCustomToolAPI:
    URL = '/api/knowledge/tools/'

    def test_create_collect_tool(self, api_client):
        r = api_client.post(self.URL, {
            'name': 'registrar_reclamo', 'description': 'Registra un reclamo',
            'archetype': 'collect_data',
            'parameters': [{'name': 'detalle', 'type': 'string', 'required': True}],
            'is_active': True,
        }, format='json')
        assert r.status_code == 201, r.content
        assert r.data['is_active'] is True

    def test_reserved_name_rejected(self, api_client):
        r = api_client.post(self.URL, {
            'name': 'create_lead', 'description': 'd', 'archetype': 'collect_data',
        }, format='json')
        assert r.status_code == 400
        assert 'name' in r.data

    def test_invalid_name_rejected(self, api_client):
        r = api_client.post(self.URL, {
            'name': 'Mala Tool!', 'description': 'd', 'archetype': 'collect_data',
        }, format='json')
        assert r.status_code == 400

    def test_webhook_cannot_self_activate_without_review(self, api_client):
        r = api_client.post(self.URL, {
            'name': 'push_crm', 'description': 'Envía al CRM', 'archetype': 'webhook',
            'config': {'url': 'https://hooks.miempresa.com/x', 'method': 'POST'},
            'is_active': True,
        }, format='json')
        assert r.status_code == 201, r.content
        # Forced inactive + pending review until an operator approves it.
        assert r.data['is_active'] is False
        assert r.data['review_status'] == 'pending_review'

    def test_approve_then_activate_webhook(self, api_client):
        tool = CustomTool.objects.create(
            name='push_crm', description='d', archetype='webhook',
            config={'url': 'https://hooks.miempresa.com/x'},
            review_status=CustomTool.STATUS_PENDING)
        r = api_client.post(f'{self.URL}{tool.id}/approve/')
        assert r.status_code == 200
        assert r.data['review_status'] == 'approved'
        # Now it can be activated.
        r2 = api_client.patch(f'{self.URL}{tool.id}/', {'is_active': True}, format='json')
        assert r2.status_code == 200
        assert r2.data['is_active'] is True

    def test_plan_limit_enforced(self, api_client):
        ws = Workspace.get_solo()
        ws.max_custom_tools = 1
        ws.save()
        CustomTool.objects.create(name='uno', description='d', archetype='collect_data')
        r = api_client.post(self.URL, {
            'name': 'dos', 'description': 'd', 'archetype': 'collect_data',
        }, format='json')
        assert r.status_code == 400


# ── RBAC: sensitive endpoints are admin-only ──────────────────────

@pytest.mark.django_db
class TestRBAC:
    def _agent_client(self):
        user = User.objects.create_user(username='agente', password='x')  # no admin, no profile
        client = APIClient(); client.force_authenticate(user=user)
        return client

    def test_non_admin_cannot_create_tool(self):
        r = self._agent_client().post('/api/knowledge/tools/', {
            'name': 'x_tool', 'description': 'd', 'archetype': 'collect_data',
        }, format='json')
        assert r.status_code == 403

    def test_non_admin_can_still_read_tools(self):
        # Reads stay open to any authenticated user (IsAdmin allows SAFE_METHODS).
        r = self._agent_client().get('/api/knowledge/tools/')
        assert r.status_code == 200

    def test_non_admin_cannot_edit_ai_config(self):
        r = self._agent_client().patch('/api/knowledge/config/', {'agent_name': 'X'}, format='json')
        assert r.status_code == 403

    def test_non_admin_cannot_read_billing(self):
        # Billing is strict admin-only, even for reads.
        r = self._agent_client().get('/api/billing/account/')
        assert r.status_code == 403

    def test_non_admin_cannot_topup(self):
        r = self._agent_client().post('/api/billing/topup/', {'amount_usd': '10'}, format='json')
        assert r.status_code == 403
