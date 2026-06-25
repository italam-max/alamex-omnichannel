import logging
from celery import shared_task

logger = logging.getLogger(__name__)


@shared_task(name='accounts.scan_sla')
def scan_sla_task() -> dict:
    """Periodic SLA sweep — creates/escalates alerts and sends overdue emails."""
    from .services import scan_sla
    summary = scan_sla()
    logger.info('[SLA] periodic scan: %s', summary)
    return summary
