import secrets
import json
import logging

from django.http import HttpResponse, JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.utils.decorators import method_decorator
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status

from conversations.models import Channel, Contact, Conversation, Message

logger = logging.getLogger(__name__)


def generate_widget_key() -> str:
    return "web_" + secrets.token_hex(20)


def _get_website_channel(widget_key: str) -> Channel | None:
    for ch in Channel.objects.filter(type="website", is_active=True):
        if (ch.credentials or {}).get("widget_key") == widget_key:
            return ch
    return None


def _get_or_create_widget_conversation(channel: Channel, session_id: str, visitor_name: str = "") -> Conversation:
    contact, _ = Contact.objects.get_or_create(
        external_id=f"web_{session_id}",
        channel=channel,
        defaults={"name": visitor_name or f"Visitante {session_id[:8]}"},
    )
    if visitor_name and contact.name.startswith("Visitante"):
        contact.name = visitor_name
        contact.save(update_fields=["name"])

    conversation, _ = Conversation.objects.get_or_create(
        contact=contact,
        channel=channel,
        status="active",
        defaults={"ai_active": True},
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
        allowed = creds.get("allowed_origins", [])
        if allowed and origin and origin not in allowed:
            return Response({"error": "Origin not allowed"}, status=403)

        resp = Response({
            "header_title":      creds.get("header_title", "Chatea con nosotros"),
            "accent_color":      creds.get("accent_color", "#2563eb"),
            "greeting_message":  creds.get("greeting_message", "¡Hola! ¿En qué puedo ayudarte?"),
            "launcher_position": creds.get("launcher_position", "bottom-right"),
        })
        resp["Access-Control-Allow-Origin"] = origin or "*"
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

    def post(self, request, widget_key):
        channel = _get_website_channel(widget_key)
        if not channel:
            return Response({"error": "Widget not found"}, status=404)

        try:
            body = json.loads(request.body)
        except json.JSONDecodeError:
            return Response({"error": "Invalid JSON"}, status=400)

        session_id   = body.get("session_id", "")
        visitor_name = body.get("visitor_name", "")
        text         = (body.get("message") or "").strip()

        if not session_id or not text:
            return Response({"error": "session_id and message are required"}, status=400)

        origin = request.headers.get("Origin", "")
        allowed = (channel.credentials or {}).get("allowed_origins", [])
        if allowed and origin and origin not in allowed:
            return Response({"error": "Origin not allowed"}, status=403)

        conversation = _get_or_create_widget_conversation(channel, session_id, visitor_name)
        Message.objects.create(conversation=conversation, role="customer", content=text)

        # Placeholder response — will be replaced by Claude agent in next sprint
        ai_reply = "Gracias por tu mensaje. Un agente te responderá pronto. 🤖"
        ai_msg = Message.objects.create(
            conversation=conversation,
            role="ai",
            content=ai_reply,
            model_used="placeholder",
        )

        resp = Response({
            "reply":           ai_reply,
            "conversation_id": conversation.id,
            "message_id":      ai_msg.id,
        })
        resp["Access-Control-Allow-Origin"] = origin or "*"
        return resp

    def options(self, request, widget_key):
        resp = HttpResponse()
        resp["Access-Control-Allow-Origin"] = request.headers.get("Origin", "*")
        resp["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
        resp["Access-Control-Allow-Headers"] = "Content-Type"
        return resp
