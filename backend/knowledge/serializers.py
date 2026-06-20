from rest_framework import serializers
from .models import KnowledgeDoc, AIConfig


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
            'updated_at',
        ]
        read_only_fields = ['id', 'updated_at']
