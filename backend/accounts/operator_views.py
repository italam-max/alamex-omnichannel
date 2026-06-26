"""
Operator (owner) console API — cross-organization, superuser/staff only.
NOT tenant-scoped: lists and manages every organization.
"""
import datetime
from decimal import Decimal

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db.models import Count, Sum
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken

from billing.models import CreditAccount, CreditTransaction
from conversations.models import Channel, Conversation
from knowledge.models import AIConfig
from .models import Organization, Membership, AccessInvite
from .permissions import IsOperator
from .provisioning import provision_organization, issue_access_link

User = get_user_model()


def _usage_30d(org):
    since = timezone.now() - datetime.timedelta(days=30)
    agg = (CreditTransaction.objects
           .filter(organization=org, type=CreditTransaction.TYPE_USAGE, created_at__gte=since)
           .aggregate(messages=Count('id'), cost=Sum('amount_usd')))
    return {'messages': agg['messages'] or 0, 'cost_usd': abs(agg['cost'] or Decimal('0'))}


def _summary(org):
    return {
        'slug': org.slug, 'name': org.name, 'is_active': org.is_active,
        'created_at': org.created_at,
        'users': org.memberships.count(),
        'conversations': Conversation.objects.filter(organization=org).count(),
        'credits_usd': CreditAccount.get_for_org(org).balance_usd,
        'usage_30d': _usage_30d(org),
    }


def _invite_link(invite):
    path = f'/activar/{invite.token}'
    base = getattr(settings, 'FRONTEND_URL', '').rstrip('/')
    return {'token': invite.token, 'path': path,
            'url': (base + path) if base else None,
            'expires_at': invite.expires_at}


class OperatorOrgViewSet(viewsets.ViewSet):
    permission_classes = [IsOperator]
    lookup_field = 'slug'

    def list(self, request):
        return Response([_summary(o) for o in Organization.objects.all()])

    def create(self, request):
        name = (request.data.get('name') or '').strip()
        email = (request.data.get('admin_email') or '').strip()
        if not name or not email:
            return Response({'detail': 'name y admin_email son obligatorios.'},
                            status=status.HTTP_400_BAD_REQUEST)
        credits = request.data.get('credits') or 0
        org, user = provision_organization(name, email, credits=credits)
        invite = issue_access_link(org, user)
        data = _summary(org)
        data['access_link'] = _invite_link(invite)
        return Response(data, status=status.HTTP_201_CREATED)

    def retrieve(self, request, slug=None):
        org = self._org(slug)
        if org is None:
            return Response({'detail': 'No encontrada'}, status=404)
        ws = AIConfig.get_for_org(org)  # touch to ensure exists (no-op)
        members = [{'email': m.user.email or m.user.username, 'role': m.role,
                    'active': m.user.is_active}
                   for m in org.memberships.select_related('user')]
        channels = [{'name': c.name, 'type': c.type, 'is_active': c.is_active}
                    for c in Channel.objects.filter(organization=org)]
        data = _summary(org)
        data.update({'members': members, 'channels': channels})
        return Response(data)

    @action(detail=True, methods=['post'])
    def suspend(self, request, slug=None):
        return self._set_active(slug, False)

    @action(detail=True, methods=['post'])
    def activate(self, request, slug=None):
        return self._set_active(slug, True)

    @action(detail=True, methods=['post'])
    def credits(self, request, slug=None):
        org = self._org(slug)
        if org is None:
            return Response({'detail': 'No encontrada'}, status=404)
        try:
            amount = Decimal(str(request.data.get('amount_usd')))
            if amount <= 0:
                raise ValueError
        except Exception:
            return Response({'detail': 'amount_usd debe ser positivo.'}, status=400)
        acc = CreditAccount.get_for_org(org)
        acc.balance_usd += amount
        acc.save(update_fields=['balance_usd', 'updated_at'])
        CreditTransaction.objects.create(
            type=CreditTransaction.TYPE_TOPUP, amount_usd=amount,
            balance_after=acc.balance_usd, description='Recarga (operador)',
            organization=org)
        return Response({'credits_usd': acc.balance_usd})

    @action(detail=True, methods=['post'])
    def invite(self, request, slug=None):
        """(Re)issue the access link for the org's admin user."""
        org = self._org(slug)
        if org is None:
            return Response({'detail': 'No encontrada'}, status=404)
        membership = org.memberships.filter(role='admin').select_related('user').first()
        if not membership:
            return Response({'detail': 'La empresa no tiene un administrador.'}, status=400)
        invite = issue_access_link(org, membership.user)
        return Response(_invite_link(invite))

    # ── helpers ──
    def _org(self, slug):
        return Organization.objects.filter(slug=slug).first()

    def _set_active(self, slug, value):
        org = self._org(slug)
        if org is None:
            return Response({'detail': 'No encontrada'}, status=404)
        org.is_active = value
        org.save(update_fields=['is_active'])
        return Response({'slug': org.slug, 'is_active': org.is_active})


# ── Public access-link (invite) endpoints ─────────────────────────

@api_view(['GET'])
@permission_classes([AllowAny])
def invite_detail(request, token):
    invite = AccessInvite.objects.select_related('organization', 'user').filter(token=token).first()
    if not invite or not invite.is_valid:
        return Response({'detail': 'Liga inválida o expirada.'}, status=status.HTTP_410_GONE)
    return Response({
        'organization': invite.organization.name,
        'email': invite.email,
    })


@api_view(['POST'])
@permission_classes([AllowAny])
def invite_accept(request, token):
    invite = AccessInvite.objects.select_related('user').filter(token=token).first()
    if not invite or not invite.is_valid:
        return Response({'detail': 'Liga inválida o expirada.'}, status=status.HTTP_410_GONE)
    password = request.data.get('password') or ''
    if len(password) < 8:
        return Response({'detail': 'La contraseña debe tener al menos 8 caracteres.'},
                        status=status.HTTP_400_BAD_REQUEST)
    user = invite.user
    user.set_password(password)
    user.is_active = True
    user.save(update_fields=['password', 'is_active'])
    invite.accepted_at = timezone.now()
    invite.save(update_fields=['accepted_at'])
    refresh = RefreshToken.for_user(user)
    return Response({'access': str(refresh.access_token), 'refresh': str(refresh)})
