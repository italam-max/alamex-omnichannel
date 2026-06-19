import requests
from django.conf import settings

GRAPH_URL = "https://graph.facebook.com/v21.0"


def send_text(recipient_id: str, body: str) -> dict:
    """Send a Messenger text reply to a PSID."""
    url = f"{GRAPH_URL}/{settings.MESSENGER_PAGE_ID}/messages"
    resp = requests.post(
        url,
        params={"access_token": settings.MESSENGER_PAGE_ACCESS_TOKEN},
        json={
            "messaging_type": "RESPONSE",
            "recipient": {"id": recipient_id},
            "message": {"text": body},
        },
        timeout=10,
    )
    resp.raise_for_status()
    return resp.json()
