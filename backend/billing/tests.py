"""Billing endpoint hardening: validation + topup concurrency safety."""
from decimal import Decimal

import pytest
from django.contrib.auth.models import User
from rest_framework.test import APIClient

from billing.models import CreditAccount, CreditTransaction


@pytest.fixture
def admin_client(db):
    user = User.objects.create_superuser(username='admin', password='x')
    client = APIClient()
    client.force_authenticate(user=user)
    return client


@pytest.mark.django_db
class TestBillingValidation:
    def test_rejects_negative_markup(self, admin_client):
        r = admin_client.patch('/api/billing/account/', {'markup_multiplier': '-1'}, format='json')
        assert r.status_code == 400

    def test_rejects_invalid_decimal(self, admin_client):
        r = admin_client.patch('/api/billing/account/', {'alert_threshold_usd': 'abc'}, format='json')
        assert r.status_code == 400

    def test_rejects_empty_patch(self, admin_client):
        r = admin_client.patch('/api/billing/account/', {'balance_usd': '999'}, format='json')
        assert r.status_code == 400  # balance is not an allowed field → nothing to update

    def test_accepts_valid_markup(self, admin_client):
        r = admin_client.patch('/api/billing/account/', {'markup_multiplier': '1.5'}, format='json')
        assert r.status_code == 200
        assert CreditAccount.get_solo().markup_multiplier == Decimal('1.5')

    def test_topup_rejects_non_positive(self, admin_client):
        r = admin_client.post('/api/billing/topup/', {'amount_usd': '0'}, format='json')
        assert r.status_code == 400

    def test_topup_adds_credits_and_logs(self, admin_client):
        start = CreditAccount.get_solo().balance_usd
        r = admin_client.post('/api/billing/topup/', {'amount_usd': '25'}, format='json')
        assert r.status_code == 201
        assert CreditAccount.get_solo().balance_usd == start + Decimal('25')
        tx = CreditTransaction.objects.order_by('-created_at').first()
        assert tx.type == CreditTransaction.TYPE_TOPUP and tx.amount_usd == Decimal('25')
