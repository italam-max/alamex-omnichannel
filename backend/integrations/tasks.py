import logging
from celery import shared_task

logger = logging.getLogger(__name__)


@shared_task(name='integrations.process_meta_webhook', bind=True, max_retries=3, default_retry_delay=5)
def process_meta_webhook(self, channel_id: int, channel_type: str, payload: dict) -> None:
    """Process a Meta webhook event asynchronously."""
    from conversations.models import Channel
    from .webhooks import handle_whatsapp, handle_messenger, handle_instagram

    handlers = {
        'whatsapp': handle_whatsapp,
        'messenger': handle_messenger,
        'instagram': handle_instagram,
    }
    try:
        channel = Channel.objects.get(pk=channel_id, is_active=True)
    except Channel.DoesNotExist:
        logger.warning("process_meta_webhook: channel %s not found or inactive", channel_id)
        return

    handler = handlers.get(channel_type)
    if not handler:
        logger.warning("process_meta_webhook: no handler for type %s", channel_type)
        return

    try:
        handler(payload, channel)
    except Exception as exc:
        logger.error("process_meta_webhook error for channel %s: %s", channel_id, exc)
        raise self.retry(exc=exc)
