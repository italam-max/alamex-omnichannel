import requests

GRAPH_URL = "https://graph.facebook.com/v21.0"


def send_text(to: str, body: str, channel, reply_to_id: str = None) -> dict:
    """Send a WhatsApp text message via Cloud API."""
    creds = channel.credentials or {}
    phone_id = creds["phone_number_id"]
    token = creds["access_token"]
    url = f"{GRAPH_URL}/{phone_id}/messages"
    payload = {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": to,
        "type": "text",
        "text": {"preview_url": False, "body": body},
    }
    if reply_to_id:
        payload["context"] = {"message_id": reply_to_id}

    resp = requests.post(
        url,
        json=payload,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        timeout=10,
    )
    resp.raise_for_status()
    return resp.json()


def mark_as_read(message_id: str, channel) -> None:
    """Mark an incoming message as read (shows double blue check)."""
    creds = channel.credentials or {}
    phone_id = creds["phone_number_id"]
    token = creds["access_token"]
    url = f"{GRAPH_URL}/{phone_id}/messages"
    requests.post(
        url,
        json={
            "messaging_product": "whatsapp",
            "status": "read",
            "message_id": message_id,
        },
        headers={"Authorization": f"Bearer {token}"},
        timeout=10,
    )
