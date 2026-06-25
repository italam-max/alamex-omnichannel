from django.urls import path
from .views import account_view, topup_view, transactions_view, usage_stats_view

urlpatterns = [
    path('account/',      account_view,      name='billing-account'),
    path('topup/',        topup_view,        name='billing-topup'),
    path('transactions/', transactions_view, name='billing-transactions'),
    path('usage/',        usage_stats_view,  name='billing-usage'),
]
