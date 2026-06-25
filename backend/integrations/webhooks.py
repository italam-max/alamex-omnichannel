import hmac
import hashlib
import json
import logging

from django.http import HttpResponse
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt
from rest_framework.views import APIView

from conversations.models import Channel, Contact, Conversation, Message
from .services.ai_agent import get_ai_response

logger = logging.getLogger(__name__)

OBJECT_TO_CHANNEL_TYPE = {
    "whatsapp_business_account": "whatsapp",
    "page": "messenger",
    "instagram": "instagram",
}


# ── Signature verification ────────────────────────────────────────

def _verify_signature(raw_body: bytes, sig_header: str, app_secret: str) -> bool:
    """Strict HMAC-SHA256 check. Rejects if app_secret is not configured."""
    if not app_secret:
        logger.warning("_verify_signature: no app_secret configured — rejecting request")
        return False
    if not sig_header or not sig_header.startswith("sha256="):
        return False
    expected = "sha256=" + hmac.new(
        app_secret.encode("utf-8"), raw_body, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, sig_header)


# ── Channel lookup via JSONField DB query (no table scan) ─────────

def _find_channel_by_verify_token(verify_token: str, channel_type: str) -> Channel | None:
    return Channel.objects.filter(
        type=channel_type,
        is_active=True,
        credentials__verify_token=verify_token,
    ).first()


def _find_channel_whatsapp(payload: dict) -> Channel | None:
    try:
        phone_id = payload["entry"][0]["changes"][0]["value"]["metadata"]["phone_number_id"]
    except (KeyError, IndexError):
        return None
    return Channel.objects.filter(
        type="whatsapp",
        is_active=True,
        credentials__phone_number_id=phone_id,
    ).first()


def _find_channel_messenger(payload: dict) -> Channel | None:
    try:
        page_id = payload["entry"][0]["id"]
    except (KeyError, IndexError):
        return None
    return Channel.objects.filter(
        type="messenger",
        is_active=True,
        credentials__page_id=page_id,
    ).first()


def _find_channel_instagram(payload: dict) -> Channel | None:
    try:
        account_id = payload["entry"][0]["id"]
    except (KeyError, IndexError):
        return None
    return Channel.objects.filter(
        type="instagram",
        is_active=True,
        credentials__instagram_account_id=account_id,
    ).first()


CHANNEL_FINDERS = {
    "whatsapp": _find_channel_whatsapp,
    "messenger": _find_channel_messenger,
    "instagram": _find_channel_instagram,
}


# ── Conversation / message persistence ───────────────────────────

def _get_or_create_conversation(channel: Channel, external_id: str, sender_name: str = "") -> tuple:
    contact, _ = Contact.objects.get_or_create(
        external_id=external_id,
        channel=channel,
        defaults={"name": sender_name or external_id},
    )
    conversation = Conversation.objects.filter(
        contact=contact,
        channel=channel,
        status__in=["active", "human_takeover"],
    ).order_by("-updated_at").first()
    if not conversation:
        conversation = Conversation.objects.create(
            contact=contact, channel=channel, status="active", ai_active=True
        )
    return conversation, contact


def _save_message(conversation: Conversation, role: str, content: str, model_used: str = '') -> Message:
    return Message.objects.create(
        conversation=conversation, role=role, content=content, model_used=model_used
    )


def _run_ai_and_respond(channel: Channel, conversation: Conversation, incoming_text: str, reply_fn=None) -> None:
    """Call AI agent, save response, optionally send back via channel API."""
    if not conversation.ai_active:
        return

    reply, should_handoff = get_ai_response(channel, conversation, incoming_text)

    if should_handoff:
        conversation.status   = 'human_takeover'
        conversation.ai_active = False
        conversation.save(update_fields=['status', 'ai_active'])
        logger.info('[AI] Conversation %s handed off to human', conversation.id)
        return

    if reply:
        from conversations.models import Channel as Ch  # avoid circular at module level
        creds = channel.credentials or {}
        model = creds.get('ai_model', 'claude-haiku-4-5-20251001')
        _save_message(conversation, 'ai', reply, model_used=model)
        if reply_fn:
            try:
                reply_fn(reply)
            except Exception as exc:
                logger.error('[AI] Failed to send reply via channel API: %s', exc)


# ── Per-channel message handlers ─────────────────────────────────

def handle_whatsapp(payload: dict, channel: Channel) -> None:
    from .services.whatsapp import send_text as wa_send
    for entry in payload.get("entry", []):
        for change in entry.get("changes", []):
            if change.get("field") != "messages":
                continue
            value = change.get("value", {})
            for msg in value.get("messages", []):
                if msg.get("type") != "text":
                    continue
                sender = msg["from"]
                text   = msg["text"]["body"]
                contacts = value.get("contacts", [])
                name = contacts[0]["profile"]["name"] if contacts else sender
                conv, _ = _get_or_create_conversation(channel, sender, name)
                _save_message(conv, "customer", text)
                logger.info("[WhatsApp][%s] %s: %s", channel.name, sender, text[:80])
                _run_ai_and_respond(
                    channel, conv, text,
                    reply_fn=lambda reply: wa_send(sender, reply, channel),
                )
            for st in value.get("statuses", []):
                if st.get("status") == "failed":
                    logger.error("[WhatsApp][%s] Delivery failed: %s", channel.name, st.get("errors"))


def handle_messenger(payload: dict, channel: Channel) -> None:
    from .services.messenger import send_text as ms_send
    for entry in payload.get("entry", []):
        for event in entry.get("messaging", []):
            msg = event.get("message", {})
            if not msg or msg.get("is_echo"):
                continue
            text = msg.get("text", "")
            if not text:
                continue
            sender_id = event["sender"]["id"]
            conv, _ = _get_or_create_conversation(channel, sender_id)
            _save_message(conv, "customer", text)
            logger.info("[Messenger][%s] %s: %s", channel.name, sender_id, text[:80])
            _run_ai_and_respond(
                channel, conv, text,
                reply_fn=lambda reply: ms_send(sender_id, reply, channel),
            )


def handle_instagram(payload: dict, channel: Channel) -> None:
    from .services.instagram import send_text as ig_send
    for entry in payload.get("entry", []):
        for event in entry.get("messaging", []):
            msg = event.get("message", {})
            if not msg or msg.get("is_echo") or msg.get("is_deleted"):
                continue
            text = msg.get("text", "")
            if not text:
                continue
            sender_igsid = event["sender"]["id"]
            conv, _ = _get_or_create_conversation(channel, sender_igsid)
            _save_message(conv, "customer", text)
            logger.info("[Instagram][%s] %s: %s", channel.name, sender_igsid, text[:80])
            _run_ai_and_respond(
                channel, conv, text,
                reply_fn=lambda reply: ig_send(sender_igsid, reply, channel),
            )


HANDLERS = {
    "whatsapp": handle_whatsapp,
    "messenger": handle_messenger,
    "instagram": handle_instagram,
}


# ── Unified webhook view ──────────────────────────────────────────

@method_decorator(csrf_exempt, name="dispatch")
class MetaWebhookView(APIView):
    authentication_classes = []
    permission_classes = []

    def get(self, request):
        mode      = request.GET.get("hub.mode")
        token     = request.GET.get("hub.verify_token")
        challenge = request.GET.get("hub.challenge")

        if mode != "subscribe" or not token:
            return HttpResponse("Forbidden", status=403)

        for ch_type in ("whatsapp", "messenger", "instagram"):
            channel = _find_channel_by_verify_token(token, ch_type)
            if channel:
                logger.info("[Webhook] Verified %s channel: %s", ch_type, channel.name)
                return HttpResponse(challenge, content_type="text/plain")

        logger.warning("[Webhook] Verification failed — no channel found for token")
        return HttpResponse("Forbidden", status=403)

    def post(self, request):
        raw_body   = request.body
        sig_header = request.headers.get("X-Hub-Signature-256", "")

        try:
            payload = json.loads(raw_body)
        except json.JSONDecodeError:
            return HttpResponse("Bad Request", status=400)

        obj = payload.get("object", "")
        channel_type = OBJECT_TO_CHANNEL_TYPE.get(obj)

        if not channel_type:
            logger.warning("[Webhook] Unknown object type: %s", obj)
            return HttpResponse("OK", status=200)

        channel = CHANNEL_FINDERS[channel_type](payload)
        if not channel:
            logger.warning("[Webhook] No active %s channel found for this payload", channel_type)
            return HttpResponse("OK", status=200)

        app_secret = (channel.credentials or {}).get("app_secret", "")
        if not _verify_signature(raw_body, sig_header, app_secret):
            logger.warning("[Webhook] Signature mismatch for channel %s", channel.name)
            return HttpResponse("Forbidden", status=403)

        # Dispatch to Celery; fall back to sync if broker unavailable
        try:
            from .tasks import process_meta_webhook
            process_meta_webhook.delay(channel.id, channel_type, payload)
        except Exception:
            HANDLERS[channel_type](payload, channel)

        return HttpResponse("OK", status=200)
