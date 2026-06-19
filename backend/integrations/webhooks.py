import hmac
import hashlib
import json
import logging

from django.conf import settings
from django.http import HttpResponse
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt
from rest_framework.views import APIView

from conversations.models import Channel, Contact, Conversation, Message

logger = logging.getLogger(__name__)


# ── Signature helpers ─────────────────────────────────────────────

def _verify_signature(raw_body: bytes, sig_header: str, secret: str) -> bool:
    if not sig_header or not sig_header.startswith("sha256="):
        return False
    expected = "sha256=" + hmac.new(
        secret.encode("utf-8"), raw_body, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, sig_header)


# ── DB helpers ────────────────────────────────────────────────────

def _get_or_create_conversation(channel_type: str, external_id: str, sender_name: str = "") -> tuple:
    """Return (conversation, message_created) for an incoming contact."""
    channel = Channel.objects.filter(type=channel_type, is_active=True).first()
    if not channel:
        channel = Channel.objects.create(name=channel_type.capitalize(), type=channel_type)

    contact, _ = Contact.objects.get_or_create(
        external_id=external_id,
        channel=channel,
        defaults={"name": sender_name or external_id},
    )

    conversation, created = Conversation.objects.get_or_create(
        contact=contact,
        channel=channel,
        status__in=["active", "human_takeover"],
        defaults={"status": "active", "ai_active": True},
    )
    return conversation, contact


def _save_message(conversation, role: str, content: str) -> Message:
    return Message.objects.create(conversation=conversation, role=role, content=content)


# ── WhatsApp handler ──────────────────────────────────────────────

def handle_whatsapp(payload: dict) -> None:
    for entry in payload.get("entry", []):
        for change in entry.get("changes", []):
            if change.get("field") != "messages":
                continue
            value = change.get("value", {})

            for msg in value.get("messages", []):
                if msg.get("type") != "text":
                    continue
                sender = msg["from"]
                text = msg["text"]["body"]
                contacts = value.get("contacts", [])
                name = contacts[0]["profile"]["name"] if contacts else sender

                conv, contact = _get_or_create_conversation("whatsapp", sender, name)
                _save_message(conv, "customer", text)
                logger.info("[WhatsApp] %s: %s", sender, text[:80])

            for status in value.get("statuses", []):
                if status.get("status") == "failed":
                    logger.error("[WhatsApp] Delivery failed: %s", status.get("errors"))


# ── Messenger handler ─────────────────────────────────────────────

def handle_messenger(payload: dict) -> None:
    for entry in payload.get("entry", []):
        for event in entry.get("messaging", []):
            msg = event.get("message", {})
            if not msg or msg.get("is_echo"):
                continue
            sender_id = event["sender"]["id"]
            text = msg.get("text", "")
            if not text:
                continue

            conv, contact = _get_or_create_conversation("messenger", sender_id)
            _save_message(conv, "customer", text)
            logger.info("[Messenger] %s: %s", sender_id, text[:80])


# ── Instagram handler ─────────────────────────────────────────────

def handle_instagram(payload: dict) -> None:
    for entry in payload.get("entry", []):
        for event in entry.get("messaging", []):
            msg = event.get("message", {})
            if not msg or msg.get("is_echo") or msg.get("is_deleted"):
                continue
            sender_igsid = event["sender"]["id"]
            text = msg.get("text", "")
            if not text:
                continue

            conv, contact = _get_or_create_conversation("instagram", sender_igsid)
            _save_message(conv, "customer", text)
            logger.info("[Instagram] %s: %s", sender_igsid, text[:80])


# ── Unified webhook view ──────────────────────────────────────────

CHANNEL_CONFIG = {
    "whatsapp_business_account": {
        "secret_setting": "WHATSAPP_APP_SECRET",
        "verify_setting": "WHATSAPP_VERIFY_TOKEN",
        "handler": handle_whatsapp,
    },
    "page": {
        "secret_setting": "MESSENGER_APP_SECRET",
        "verify_setting": "MESSENGER_VERIFY_TOKEN",
        "handler": handle_messenger,
    },
    "instagram": {
        "secret_setting": "INSTAGRAM_APP_SECRET",
        "verify_setting": "INSTAGRAM_VERIFY_TOKEN",
        "handler": handle_instagram,
    },
}


@method_decorator(csrf_exempt, name="dispatch")
class MetaWebhookView(APIView):
    """Single endpoint for WhatsApp, Messenger and Instagram webhooks."""

    authentication_classes = []
    permission_classes = []

    def get(self, request):
        """Webhook verification handshake — Meta sends this once on setup."""
        mode      = request.GET.get("hub.mode")
        token     = request.GET.get("hub.verify_token")
        challenge = request.GET.get("hub.challenge")

        # Find which channel matches the verify token
        for cfg in CHANNEL_CONFIG.values():
            expected_token = getattr(settings, cfg["verify_setting"], "")
            if mode == "subscribe" and token == expected_token:
                return HttpResponse(challenge, content_type="text/plain")

        logger.warning("[Webhook] Verification failed — unknown token")
        return HttpResponse("Forbidden", status=403)

    def post(self, request):
        """Receive signed events — routes to correct channel handler."""
        raw_body   = request.body
        sig_header = request.headers.get("X-Hub-Signature-256", "")

        try:
            payload = json.loads(raw_body)
        except json.JSONDecodeError:
            return HttpResponse("Bad Request", status=400)

        obj = payload.get("object", "")
        cfg = CHANNEL_CONFIG.get(obj)

        if not cfg:
            logger.warning("[Webhook] Unknown object type: %s", obj)
            return HttpResponse("OK", status=200)

        secret = getattr(settings, cfg["secret_setting"], "")
        if secret and not _verify_signature(raw_body, sig_header, secret):
            logger.warning("[Webhook] Signature mismatch for %s", obj)
            return HttpResponse("Forbidden", status=403)

        cfg["handler"](payload)
        return HttpResponse("OK", status=200)
