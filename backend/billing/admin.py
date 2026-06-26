from django.contrib import admin

from .models import CreditAccount, CreditTransaction


@admin.register(CreditAccount)
class CreditAccountAdmin(admin.ModelAdmin):
    list_display = ('organization', 'balance_usd', 'markup_multiplier',
                    'alert_threshold_usd', 'updated_at')
    search_fields = ('organization__name',)


@admin.register(CreditTransaction)
class CreditTransactionAdmin(admin.ModelAdmin):
    list_display = ('organization', 'type', 'amount_usd', 'balance_after',
                    'model_used', 'created_at')
    list_filter = ('organization', 'type', 'model_used')
    date_hierarchy = 'created_at'
