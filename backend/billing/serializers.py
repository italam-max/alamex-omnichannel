from rest_framework import serializers
from .models import CreditAccount, CreditTransaction, MODEL_PRICING


class CreditAccountSerializer(serializers.ModelSerializer):
    is_low  = serializers.SerializerMethodField()
    pricing = serializers.SerializerMethodField()

    class Meta:
        model  = CreditAccount
        fields = ['id', 'balance_usd', 'markup_multiplier', 'alert_threshold_usd',
                  'is_low', 'pricing', 'updated_at']
        read_only_fields = ['id', 'balance_usd', 'is_low', 'pricing', 'updated_at']

    def get_is_low(self, obj):
        return obj.is_low()

    def get_pricing(self, obj):
        out = {}
        for model, p in MODEL_PRICING.items():
            out[model] = {
                'input_per_1m_anthropic':  str(p['input']),
                'output_per_1m_anthropic': str(p['output']),
                'input_per_1m_charged':    str((p['input']  * obj.markup_multiplier).quantize(__import__('decimal').Decimal('0.01'))),
                'output_per_1m_charged':   str((p['output'] * obj.markup_multiplier).quantize(__import__('decimal').Decimal('0.01'))),
            }
        return out


class CreditTransactionSerializer(serializers.ModelSerializer):
    class Meta:
        model  = CreditTransaction
        fields = ['id', 'type', 'amount_usd', 'balance_after', 'description',
                  'model_used', 'input_tokens', 'output_tokens', 'channel_id', 'created_at']
        read_only_fields = fields
