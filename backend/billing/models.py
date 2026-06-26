from decimal import Decimal
from django.db import models
from accounts.tenancy import TenantOwned

# Anthropic list prices USD per 1M tokens (input / output)
MODEL_PRICING = {
    'claude-haiku-4-5-20251001': {'input': Decimal('0.80'),  'output': Decimal('4.00')},
    'claude-sonnet-4-6':         {'input': Decimal('3.00'),  'output': Decimal('15.00')},
    'claude-opus-4-8':           {'input': Decimal('15.00'), 'output': Decimal('75.00')},
}
_DEFAULT_MODEL = 'claude-haiku-4-5-20251001'


class CreditAccount(TenantOwned):
    """Singleton (pk=1) — platform-wide credit balance and billing config."""
    balance_usd        = models.DecimalField(max_digits=12, decimal_places=4, default=Decimal('0'))
    markup_multiplier  = models.DecimalField(max_digits=6,  decimal_places=2, default=Decimal('5.00'),
                                             help_text='Factor aplicado sobre el costo real de Anthropic')
    alert_threshold_usd = models.DecimalField(max_digits=8,  decimal_places=2, default=Decimal('5.00'),
                                              help_text='Alerta cuando el saldo baje de este valor')
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Credit Account'
        constraints = [
            models.UniqueConstraint(fields=['organization'], name='uniq_creditaccount_org'),
        ]

    @classmethod
    def get_for_org(cls, organization):
        obj, _ = cls.objects.get_or_create(organization=organization)
        return obj

    @classmethod
    def get_solo(cls):
        # Per-org singleton; raises without an org context (defense in depth).
        from accounts.tenancy import get_current_organization, TenantContextMissing
        org = get_current_organization()
        if org is None:
            raise TenantContextMissing(
                f'{cls.__name__}.get_solo() called without an organization context.')
        return cls.get_for_org(org)

    def compute_cost(self, model: str, input_tokens: int, output_tokens: int) -> Decimal:
        pricing = MODEL_PRICING.get(model, MODEL_PRICING[_DEFAULT_MODEL])
        base = (
            Decimal(str(input_tokens))  * pricing['input'] +
            Decimal(str(output_tokens)) * pricing['output']
        ) / Decimal('1000000')
        return (base * self.markup_multiplier).quantize(Decimal('0.000001'))

    def is_low(self) -> bool:
        return self.balance_usd <= self.alert_threshold_usd

    def has_funds(self) -> bool:
        return self.balance_usd > Decimal('0')


class CreditTransaction(TenantOwned):
    TYPE_TOPUP = 'topup'
    TYPE_USAGE = 'usage'
    TYPE_CHOICES = [(TYPE_TOPUP, 'Recarga'), (TYPE_USAGE, 'Consumo')]

    type          = models.CharField(max_length=10, choices=TYPE_CHOICES)
    amount_usd    = models.DecimalField(max_digits=12, decimal_places=6)  # + topup / − usage
    balance_after = models.DecimalField(max_digits=12, decimal_places=4)
    description   = models.CharField(max_length=300, blank=True)
    model_used    = models.CharField(max_length=100, blank=True)
    input_tokens  = models.IntegerField(default=0)
    output_tokens = models.IntegerField(default=0)
    channel_id    = models.IntegerField(null=True, blank=True)
    created_at    = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        sign = '+' if self.amount_usd >= 0 else ''
        return f'[{self.type}] {sign}{self.amount_usd} USD'
