"""
Management command: agent_stats

Muestra estadísticas de uso del agente IA para un período dado.

Uso:
  python manage.py agent_stats           # últimas 24 horas
  python manage.py agent_stats --days 7  # últimos 7 días
  python manage.py agent_stats --channel 1  # canal específico
"""
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.db.models import Sum, Count, Avg
from django.utils import timezone


class Command(BaseCommand):
    help = 'Muestra estadísticas de uso del agente IA ReAct'

    def add_arguments(self, parser):
        parser.add_argument('--days', type=int, default=1, help='Período en días (default: 1)')
        parser.add_argument('--channel', type=int, default=None, help='Filtrar por canal ID')

    def handle(self, *args, **options):
        from billing.models import CreditTransaction
        from conversations.models import Conversation, Message
        from contacts.models import Lead, FollowUp

        days = options['days']
        channel_id = options['channel']
        since = timezone.now() - timedelta(days=days)

        self.stdout.write(self.style.SUCCESS(
            f'\n=== Estadísticas Agente IA — últimos {days} día(s) ===\n'
        ))

        # Transacciones de billing
        tx_qs = CreditTransaction.objects.filter(
            created_at__gte=since,
            type=CreditTransaction.TYPE_USAGE,
        )
        if channel_id:
            tx_qs = tx_qs.filter(channel_id=channel_id)

        tx_totals = tx_qs.aggregate(
            calls=Count('id'),
            total_in=Sum('input_tokens'),
            total_out=Sum('output_tokens'),
            total_cost=Sum('amount_usd'),
            avg_in=Avg('input_tokens'),
            avg_out=Avg('output_tokens'),
        )

        calls = tx_totals['calls'] or 0
        total_in = tx_totals['total_in'] or 0
        total_out = tx_totals['total_out'] or 0
        total_cost = abs(tx_totals['total_cost'] or 0)
        avg_in = int(tx_totals['avg_in'] or 0)
        avg_out = int(tx_totals['avg_out'] or 0)

        self.stdout.write(f'Llamadas al agente: {calls}')
        self.stdout.write(f'Input tokens:       {total_in:,}  (promedio: {avg_in:,}/llamada)')
        self.stdout.write(f'Output tokens:      {total_out:,}  (promedio: {avg_out:,}/llamada)')
        self.stdout.write(f'Costo total:        ${total_cost:.4f} USD')
        if calls:
            self.stdout.write(f'Costo por llamada:  ${total_cost/calls:.5f} USD')

        # Desglose por modelo
        by_model = (
            tx_qs.values('model_used')
            .annotate(n=Count('id'), cost=Sum('amount_usd'))
            .order_by('-n')
        )
        if by_model:
            self.stdout.write('\n--- Por modelo ---')
            for row in by_model:
                self.stdout.write(f"  {row['model_used']}: {row['n']} calls | ${abs(row['cost'] or 0):.4f}")

        # Conversaciones
        conv_qs = Conversation.objects.filter(updated_at__gte=since)
        if channel_id:
            conv_qs = conv_qs.filter(channel_id=channel_id)

        conv_totals = conv_qs.aggregate(
            total=Count('id'),
            handoffs=Count('id', filter=__import__('django.db.models', fromlist=['Q']).Q(status='human_takeover')),
        )
        from django.db.models import Q
        conv_handoffs = conv_qs.filter(status='human_takeover').count()
        conv_total = conv_qs.count()

        self.stdout.write(f'\nConversaciones:     {conv_total}')
        self.stdout.write(f'Escaladas a humano: {conv_handoffs}')
        if conv_total:
            pct = conv_handoffs / conv_total * 100
            self.stdout.write(f'Tasa de escalado:   {pct:.1f}%')

        # Leads y followups creados
        lead_count = Lead.objects.filter(created_at__gte=since).count()
        fu_count = FollowUp.objects.filter(created_at__gte=since).count()
        self.stdout.write(f'\nLeads creados:      {lead_count}')
        self.stdout.write(f'Followups creados:  {fu_count}')

        # Mensajes AI
        ai_msgs = Message.objects.filter(role='ai', created_at__gte=since)
        if channel_id:
            ai_msgs = ai_msgs.filter(conversation__channel_id=channel_id)
        self.stdout.write(f'Mensajes AI:        {ai_msgs.count()}')

        # Balance actual
        try:
            from billing.models import CreditAccount
            acc = CreditAccount.get_solo()
            color = self.style.WARNING if acc.balance_usd < acc.alert_threshold_usd * 2 else self.style.SUCCESS
            self.stdout.write(f'\n{color(f"Balance actual: ${acc.balance_usd:.4f} USD")}')
        except Exception:
            pass

        self.stdout.write('')
