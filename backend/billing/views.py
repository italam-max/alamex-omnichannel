from decimal import Decimal, InvalidOperation
from django.conf import settings
from django.db import transaction as db_transaction
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework import status

from accounts.permissions import IsAdminStrict
from .models import CreditAccount, CreditTransaction
from .serializers import CreditAccountSerializer, CreditTransactionSerializer


@api_view(['GET', 'PATCH'])
@permission_classes([IsAdminStrict])
def account_view(request):
    """GET: full account state. PATCH: update markup/alert_threshold."""
    account = CreditAccount.get_solo()

    if request.method == 'GET':
        data = CreditAccountSerializer(account).data
        data['anthropic_key_configured'] = bool(getattr(settings, 'ANTHROPIC_API_KEY', ''))
        return Response(data)

    # PATCH — only billing config fields (not balance)
    allowed = {'markup_multiplier', 'alert_threshold_usd'}
    updates = {k: v for k, v in request.data.items() if k in allowed}
    for field, value in updates.items():
        try:
            setattr(account, field, Decimal(str(value)))
        except (InvalidOperation, TypeError):
            return Response({'error': f'Valor inválido para {field}'}, status=status.HTTP_400_BAD_REQUEST)
    account.save(update_fields=list(updates.keys()) + ['updated_at'])
    return Response(CreditAccountSerializer(account).data)


@api_view(['POST'])
@permission_classes([IsAdminStrict])
def topup_view(request):
    """Add credits to the account."""
    try:
        amount = Decimal(str(request.data.get('amount_usd', 0)))
        if amount <= 0:
            raise ValueError
    except (InvalidOperation, TypeError, ValueError):
        return Response({'error': 'amount_usd debe ser un número positivo'}, status=status.HTTP_400_BAD_REQUEST)

    description = (request.data.get('description') or f'Recarga manual').strip()[:300]

    with db_transaction.atomic():
        account = CreditAccount.objects.select_for_update().get(pk=1) if CreditAccount.objects.exists() \
            else CreditAccount.get_solo()
        account.balance_usd += amount
        account.save(update_fields=['balance_usd', 'updated_at'])
        tx = CreditTransaction.objects.create(
            type=CreditTransaction.TYPE_TOPUP,
            amount_usd=amount,
            balance_after=account.balance_usd,
            description=description,
        )

    return Response(CreditTransactionSerializer(tx).data, status=status.HTTP_201_CREATED)


@api_view(['GET'])
@permission_classes([IsAdminStrict])
def transactions_view(request):
    """Last 50 transactions."""
    qs = CreditTransaction.objects.all()[:50]
    return Response(CreditTransactionSerializer(qs, many=True).data)


@api_view(['GET'])
@permission_classes([IsAdminStrict])
def usage_stats_view(request):
    """Aggregate usage for the last 30 days (by model)."""
    from django.utils import timezone
    from django.db.models import Sum, Count
    import datetime

    since = timezone.now() - datetime.timedelta(days=30)
    stats = (
        CreditTransaction.objects
        .filter(type=CreditTransaction.TYPE_USAGE, created_at__gte=since)
        .values('model_used')
        .annotate(
            messages=Count('id'),
            total_input=Sum('input_tokens'),
            total_output=Sum('output_tokens'),
            total_cost=Sum('amount_usd'),
        )
        .order_by('-messages')
    )
    return Response(list(stats))
