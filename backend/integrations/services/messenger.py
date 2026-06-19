import requests

GRAPH_URL = "https://graph.facebook.com/v21.0"


def send_text(recipient_id: str, body: str, channel) -> dict:
    """Send a Messenger text reply to a PSID."""
    creds = channel.credentials or {}
    page_id = creds["page_id"]
    token = creds["page_access_token"]
    url = f"{GRAPH_URL}/{page_id}/messages"
    resp = requests.post(
        url,
        params={"access_token": token},
        json={
            "messaging_type": "RESPONSE",
            "recipient": {"id": recipient_id},
            "message": {"text": body},
        },
        timeout=10,
    )
    resp.raise_for_status()
    return resp.json()
