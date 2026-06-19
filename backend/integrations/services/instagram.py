import requests

GRAPH_URL = "https://graph.facebook.com/v21.0"


def send_text(recipient_igsid: str, body: str, channel) -> dict:
    """Send an Instagram DM reply (max 1000 chars)."""
    creds = channel.credentials or {}
    account_id = creds["instagram_account_id"]
    token = creds["access_token"]
    url = f"{GRAPH_URL}/{account_id}/messages"
    resp = requests.post(
        url,
        params={"access_token": token},
        json={
            "recipient": {"id": recipient_igsid},
            "message": {"text": body[:1000]},
        },
        timeout=10,
    )
    resp.raise_for_status()
    return resp.json()
