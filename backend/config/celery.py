import os
from celery import Celery

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

app = Celery('alamex')
app.config_from_object('django.conf:settings', namespace='CELERY')
app.autodiscover_tasks()

# Periodic SLA sweep — runs every minute so escalations fire close to the
# configured thresholds. Requires `celery -A config beat` alongside the worker.
app.conf.beat_schedule = {
    'scan-sla-every-minute': {
        'task': 'accounts.scan_sla',
        'schedule': 60.0,
    },
}
