import requests
from django.conf import settings

GRAPH_URL = "https://graph.facebook.com/v21.0"


def send_text(recipient_igsid: str, body: str) -> dict:
    """Send an Instagram DM reply (max 1000 chars)."""
    url = f"{GRAPH_URL}/{settings.INSTAGRAM_ACCOUNT_ID}/messages"
    resp = requests.post(
        url,
        params={"access_token": settings.INSTAGRAM_ACCESS_TOKEN},
        json={
            "recipient": {"id": recipient_igsid},
            "message": {"text": body[:1000]},
        },
        timeout=10,
    )
    resp.raise_for_status()
    return resp.json()
