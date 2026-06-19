import hmac
import hashlib
import json
import pytest
from django.test import RequestFactory
from unittest.mock import patch

from conversations.models import Channel, Contact, Conversation
from integrations.webhooks import (
    _verify_signature,
    _find_channel_whatsapp,
    _find_channel_messenger,
    _find_channel_instagram,
    _find_channel_by_verify_token,
    _get_or_create_conversation,
    MetaWebhookView,
)


def _make_sig(body: bytes, secret: str) -> str:
    return "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


# ── HMAC verification ─────────────────────────────────────────────

class TestVerifySignature:
    def test_valid_signature_accepted(self):
        body = b'{"test": 1}'
        secret = "mysecret"
        sig = _make_sig(body, secret)
        assert _verify_signature(body, sig, secret) is True

    def test_invalid_signature_rejected(self):
        body = b'{"test": 1}'
        assert _verify_signature(body, "sha256=wronghash", "mysecret") is False

    def test_missing_signature_rejected(self):
        assert _verify_signature(b"body", "", "mysecret") is False

    def test_empty_app_secret_rejects(self):
        """No app_secret configured → must reject, not skip."""
        assert _verify_signature(b"body", "sha256=anything", "") is False

    def test_missing_sha256_prefix_rejected(self):
        body = b"body"
        secret = "sec"
        raw_hash = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
        assert _verify_signature(body, raw_hash, secret) is False


# ── Channel lookup by JSONField ───────────────────────────────────

@pytest.mark.django_db
class TestChannelLookup:
    @pytest.fixture(autouse=True)
    def channels(self, db):
        self.wa = Channel.objects.create(
            name='WA', type='whatsapp', is_active=True,
            credentials={'phone_number_id': 'phone123', 'app_secret': 'sec', 'verify_token': 'vt_wa'},
        )
        self.ms = Channel.objects.create(
            name='MS', type='messenger', is_active=True,
            credentials={'page_id': 'page456', 'verify_token': 'vt_ms'},
        )
        self.ig = Channel.objects.create(
            name='IG', type='instagram', is_active=True,
            credentials={'instagram_account_id': 'igacc789', 'verify_token': 'vt_ig'},
        )

    def test_find_whatsapp_by_phone_number_id(self):
        payload = {"entry": [{"changes": [{"value": {"metadata": {"phone_number_id": "phone123"}}}]}]}
        assert _find_channel_whatsapp(payload) == self.wa

    def test_find_whatsapp_returns_none_for_unknown(self):
        payload = {"entry": [{"changes": [{"value": {"metadata": {"phone_number_id": "unknown"}}}]}]}
        assert _find_channel_whatsapp(payload) is None

    def test_find_messenger_by_page_id(self):
        payload = {"entry": [{"id": "page456"}]}
        assert _find_channel_messenger(payload) == self.ms

    def test_find_instagram_by_account_id(self):
        payload = {"entry": [{"id": "igacc789"}]}
        assert _find_channel_instagram(payload) == self.ig

    def test_find_channel_by_verify_token(self):
        assert _find_channel_by_verify_token("vt_wa", "whatsapp") == self.wa
        assert _find_channel_by_verify_token("vt_ms", "messenger") == self.ms
        assert _find_channel_by_verify_token("vt_ig", "instagram") == self.ig
        assert _find_channel_by_verify_token("wrong", "whatsapp") is None

    def test_inactive_channel_not_found(self):
        self.wa.is_active = False
        self.wa.save()
        payload = {"entry": [{"changes": [{"value": {"metadata": {"phone_number_id": "phone123"}}}]}]}
        assert _find_channel_whatsapp(payload) is None


# ── _get_or_create_conversation idempotency ───────────────────────

@pytest.mark.django_db
class TestGetOrCreateConversation:
    def test_creates_conversation_on_first_message(self, db):
        ch = Channel.objects.create(name='WA', type='whatsapp', is_active=True, credentials={})
        conv, contact = _get_or_create_conversation(ch, '+521234567890', 'Juan')
        assert conv is not None
        assert contact.external_id == '+521234567890'
        assert conv.status == 'active'

    def test_reuses_existing_active_conversation(self, db):
        ch = Channel.objects.create(name='WA', type='whatsapp', is_active=True, credentials={})
        conv1, _ = _get_or_create_conversation(ch, '+521234567890', 'Juan')
        conv2, _ = _get_or_create_conversation(ch, '+521234567890', 'Juan')
        assert conv1.id == conv2.id

    def test_no_multiple_objects_returned_with_two_conversations(self, db):
        """Critical regression: contact with two active conversations must not crash."""
        ch = Channel.objects.create(name='WA', type='whatsapp', is_active=True, credentials={})
        contact, _ = Contact.objects.get_or_create(
            external_id='+52999', channel=ch, defaults={'name': 'Test'}
        )
        Conversation.objects.create(contact=contact, channel=ch, status='active', ai_active=True)
        Conversation.objects.create(contact=contact, channel=ch, status='human_takeover', ai_active=False)
        # Must not raise MultipleObjectsReturned
        conv, _ = _get_or_create_conversation(ch, '+52999', 'Test')
        assert conv is not None


# ── Webhook view integration ──────────────────────────────────────

@pytest.mark.django_db
class TestMetaWebhookView:
    @pytest.fixture(autouse=True)
    def setup(self, db):
        self.factory = RequestFactory()
        self.wa = Channel.objects.create(
            name='WA', type='whatsapp', is_active=True,
            credentials={
                'phone_number_id': 'ph001',
                'app_secret': 'appsecret',
                'verify_token': 'vtok',
                'access_token': 'tok',
            },
        )

    def _post(self, payload: dict, secret: str = 'appsecret'):
        body = json.dumps(payload).encode()
        sig = _make_sig(body, secret)
        request = self.factory.post(
            '/api/integrations/webhook/meta/',
            data=body,
            content_type='application/json',
            HTTP_X_HUB_SIGNATURE_256=sig,
        )
        return MetaWebhookView.as_view()(request)

    def test_verification_get_succeeds(self):
        request = self.factory.get(
            '/api/integrations/webhook/meta/',
            {'hub.mode': 'subscribe', 'hub.verify_token': 'vtok', 'hub.challenge': 'CHALLENGE'},
        )
        response = MetaWebhookView.as_view()(request)
        assert response.status_code == 200
        assert response.content == b'CHALLENGE'

    def test_verification_wrong_token_fails(self):
        request = self.factory.get(
            '/api/integrations/webhook/meta/',
            {'hub.mode': 'subscribe', 'hub.verify_token': 'wrong', 'hub.challenge': 'X'},
        )
        response = MetaWebhookView.as_view()(request)
        assert response.status_code == 403

    def test_invalid_signature_rejected(self):
        # Payload must match the channel so it's found — then signature check runs
        payload = {
            "object": "whatsapp_business_account",
            "entry": [{"changes": [{"value": {"metadata": {"phone_number_id": "ph001"}}}]}],
        }
        body = json.dumps(payload).encode()
        request = self.factory.post(
            '/api/integrations/webhook/meta/',
            data=body,
            content_type='application/json',
            HTTP_X_HUB_SIGNATURE_256='sha256=badhash',
        )
        response = MetaWebhookView.as_view()(request)
        assert response.status_code == 403

    def test_valid_whatsapp_event_processed(self):
        from unittest.mock import MagicMock, patch as _patch
        mock_handler = MagicMock()
        payload = {
            "object": "whatsapp_business_account",
            "entry": [{"changes": [{"field": "messages", "value": {
                "metadata": {"phone_number_id": "ph001"},
                "messages": [{"from": "+52111", "type": "text", "text": {"body": "Hola"}}],
                "contacts": [{"profile": {"name": "Carlos"}}],
            }}]}],
        }
        # Patch the HANDLERS dict entry and force Celery fallback (task import is lazy)
        with _patch.dict('integrations.webhooks.HANDLERS', {'whatsapp': mock_handler}):
            with _patch('integrations.tasks.process_meta_webhook') as mock_task:
                mock_task.delay.side_effect = Exception("no redis")
                response = self._post(payload)
        assert response.status_code == 200
        mock_handler.assert_called_once()


# ── Widget endpoint ───────────────────────────────────────────────

@pytest.mark.django_db
class TestWidgetMessageView:
    @pytest.fixture(autouse=True)
    def setup(self, db):
        self.factory = RequestFactory()
        self.channel = Channel.objects.create(
            name='Web', type='website', is_active=True,
            credentials={'widget_key': 'web_testkey123'},
        )

    def _post(self, key, payload):
        from integrations.widget import WidgetMessageView
        body = json.dumps(payload).encode()
        request = self.factory.post(
            f'/api/integrations/widget/{key}/message/',
            data=body,
            content_type='application/json',
        )
        return WidgetMessageView.as_view()(request, widget_key=key)

    def test_first_message_creates_session(self):
        resp = self._post('web_testkey123', {'message': 'Hola', 'visitor_name': 'Test'})
        assert resp.status_code == 200
        data = resp.data
        assert 'session_id' in data
        assert data['session_id']

    def test_second_message_reuses_session(self):
        resp1 = self._post('web_testkey123', {'message': 'Hola', 'visitor_name': 'Test'})
        session_id = resp1.data['session_id']
        resp2 = self._post('web_testkey123', {'message': 'Siguiente', 'session_id': session_id})
        assert resp2.status_code == 200
        assert resp2.data['session_id'] == session_id
        assert resp2.data['conversation_id'] == resp1.data['conversation_id']

    def test_unknown_widget_key_returns_404(self):
        resp = self._post('web_unknown', {'message': 'Hola'})
        assert resp.status_code == 404

    def test_missing_message_returns_400(self):
        resp = self._post('web_testkey123', {'visitor_name': 'Test'})
        assert resp.status_code == 400

    def test_fake_session_id_creates_new_session(self):
        """Attacker sending a made-up session_id must get a new session, not steal another."""
        resp = self._post('web_testkey123', {'message': 'Hack', 'session_id': 'fakeid999'})
        assert resp.status_code == 200
        assert resp.data['session_id'] != 'fakeid999'
