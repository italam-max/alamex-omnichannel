from rest_framework import serializers
from .models import Integration, Quote


class IntegrationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Integration
        fields = '__all__'


class QuoteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Quote
        fields = '__all__'
