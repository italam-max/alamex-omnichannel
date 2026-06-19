from rest_framework import serializers
from .models import KnowledgeDoc


class KnowledgeDocSerializer(serializers.ModelSerializer):
    class Meta:
        model = KnowledgeDoc
        fields = '__all__'
