from rest_framework import serializers
from .models import KnowledgeDoc, AIConfig

_SECRET = '••••••••'


class KnowledgeDocSerializer(serializers.ModelSerializer):
    class Meta:
        model = KnowledgeDoc
        fields = ['id', 'title', 'content', 'is_active', 'order', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']


class AIConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = AIConfig
        fields = [
            'id', 'overview',
            'agent_name', 'agent_gender', 'company_name', 'tone',
            'identity_line', 'agent_description',
            'behavior_rules',
            'language_policy', 'supported_languages',
            'ai_api_key',
            'updated_at',
        ]
        read_only_fields = ['id', 'updated_at']

    def to_representation(self, instance):
        rep = super().to_representation(instance)
        if rep.get('ai_api_key'):
            rep['ai_api_key'] = _SECRET
        return rep

    def update(self, instance, validated_data):
        # Blank secret = keep existing
        if validated_data.get('ai_api_key', '') == '' or validated_data.get('ai_api_key') == _SECRET:
            validated_data.pop('ai_api_key', None)
        return super().update(instance, validated_data)
