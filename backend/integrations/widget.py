import secrets
import json
import logging

from django.http import HttpResponse
from django.views.decorators.csrf import csrf_exempt
from django.utils.decorators import method_decorator
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle

from conversations.models import Channel, Contact, Conversation, Message

logger = logging.getLogger(__name__)

SESSION_ID_PREFIX = "web_"


class WidgetMessageThrottle(AnonRateThrottle):
    scope = 'widget_message'


def generate_widget_key() -> str:
    return "web_" + secrets.token_hex(20)


def _generate_session_id() -> str:
    return secrets.token_hex(24)


def _get_website_channel(widget_key: str) -> Channel | None:
    return Channel.objects.filter(
        type="website",
        is_active=True,
        credentials__widget_key=widget_key,
    ).first()


def _normalize_allowed_origins(allowed) -> list:
    if isinstance(allowed, str):
        return [s.strip() for s in allowed.splitlines() if s.strip()]
    return allowed or []


def _check_origin(origin: str, allowed: list) -> bool:
    """Return True if origin is allowed (or no restrictions configured)."""
    if not allowed or not origin:
        return True
    return origin in allowed


def _get_or_create_widget_contact(channel: Channel, session_id: str, visitor_name: str) -> tuple:
    """Resolve or create a Contact from a server-side session_id."""
    external_id = f"{SESSION_ID_PREFIX}{session_id}"
    contact, created = Contact.objects.get_or_create(
        external_id=external_id,
        channel=channel,
        defaults={"name": visitor_name or f"Visitante {session_id[:8]}"},
    )
    if not created and visitor_name and contact.name.startswith("Visitante"):
        contact.name = visitor_name
        contact.save(update_fields=["name"])
    return contact, created


def _get_or_create_widget_conversation(contact: Contact, channel: Channel) -> Conversation:
    conversation = Conversation.objects.filter(
        contact=contact,
        channel=channel,
    ).exclude(status="blocked").order_by("-updated_at").first()
    if not conversation:
        conversation = Conversation.objects.create(
            contact=contact, channel=channel, status="active", ai_active=True
        )
    return conversation


@method_decorator(csrf_exempt, name="dispatch")
class WidgetConfigView(APIView):
    """Public — returns widget configuration for a given key."""
    authentication_classes = []
    permission_classes = []

    def get(self, request, widget_key):
        channel = _get_website_channel(widget_key)
        if not channel:
            return Response({"error": "Widget not found"}, status=404)

        creds = channel.credentials or {}
        origin = request.headers.get("Origin", "")
        allowed = _normalize_allowed_origins(creds.get("allowed_origins", []))
        if not _check_origin(origin, allowed):
            return Response({"error": "Origin not allowed"}, status=403)

        resp = Response({
            "header_title":      creds.get("header_title", "Chatea con nosotros"),
            "accent_color":      creds.get("accent_color", "#2563eb"),
            "greeting_message":  creds.get("greeting_message", "¡Hola! ¿En qué puedo ayudarte?"),
            "launcher_position": creds.get("launcher_position", "bottom-right"),
        })
        resp["Access-Control-Allow-Origin"] = origin if origin else "*"
        return resp

    def options(self, request, widget_key):
        resp = HttpResponse()
        resp["Access-Control-Allow-Origin"] = request.headers.get("Origin", "*")
        resp["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
        resp["Access-Control-Allow-Headers"] = "Content-Type"
        return resp


@method_decorator(csrf_exempt, name="dispatch")
class WidgetMessageView(APIView):
    """Public — receives a visitor message and returns the AI reply."""
    authentication_classes = []
    permission_classes = []
    throttle_classes = [WidgetMessageThrottle]

    def post(self, request, widget_key):
        channel = _get_website_channel(widget_key)
        if not channel:
            return Response({"error": "Widget not found"}, status=404)

        try:
            body = json.loads(request.body)
        except json.JSONDecodeError:
            return Response({"error": "Invalid JSON"}, status=400)

        client_session_id = (body.get("session_id") or "").strip()
        visitor_name      = (body.get("visitor_name") or "").strip()
        text              = (body.get("message") or "").strip()

        if not text:
            return Response({"error": "message is required"}, status=400)

        origin = request.headers.get("Origin", "")
        creds = channel.credentials or {}
        allowed = _normalize_allowed_origins(creds.get("allowed_origins", []))
        if not _check_origin(origin, allowed):
            return Response({"error": "Origin not allowed"}, status=403)

        # Resolve session: validate client-provided or generate a new one
        session_id = None
        if client_session_id:
            # Check if this session_id already exists in our DB
            existing = Contact.objects.filter(
                external_id=f"{SESSION_ID_PREFIX}{client_session_id}",
                channel=channel,
            ).first()
            if existing:
                session_id = client_session_id

        if not session_id:
            # New session: server generates the authoritative id
            session_id = _generate_session_id()

        contact, _ = _get_or_create_widget_contact(channel, session_id, visitor_name)
        conversation = _get_or_create_widget_conversation(contact, channel)
        Message.objects.create(conversation=conversation, role="customer", content=text)

        # Placeholder — real AI agent in next sprint
        ai_reply = "Gracias por tu mensaje. Un agente te responderá pronto."
        ai_msg = Message.objects.create(
            conversation=conversation,
            role="ai",
            content=ai_reply,
            model_used="placeholder",
        )

        resp = Response({
            "reply":           ai_reply,
            "session_id":      session_id,
            "conversation_id": conversation.id,
            "message_id":      ai_msg.id,
        })
        resp["Access-Control-Allow-Origin"] = origin if origin else "*"
        return resp

    def options(self, request, widget_key):
        resp = HttpResponse()
        resp["Access-Control-Allow-Origin"] = request.headers.get("Origin", "*")
        resp["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
        resp["Access-Control-Allow-Headers"] = "Content-Type"
        return resp
