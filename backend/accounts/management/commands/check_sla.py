from django.core.management.base import BaseCommand

from accounts.services import scan_sla


class Command(BaseCommand):
    help = 'Scan human-takeover conversations and raise/escalate SLA alerts.'

    def handle(self, *args, **options):
        summary = scan_sla()
        self.stdout.write(self.style.SUCCESS(
            f"SLA scan: scanned={summary['scanned']} "
            f"warning={summary['warning']} critical={summary['critical']} "
            f"escalated={summary['escalated']} emails={summary['emails']}"
        ))
