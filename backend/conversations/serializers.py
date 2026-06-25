import secrets
from rest_framework import serializers
from .models import Channel, Contact, Conversation, Message

# Fields considered secret — never returned to the client after save
SECRET_FIELDS = {"access_token", "page_access_token", "app_secret", "verify_token", "ai_api_key"}


class ChannelSerializer(serializers.ModelSerializer):
    """
    Read: returns credentials with secrets masked as '••••••••'.
    Write: accepts credentials dict; blank secret fields keep the existing value.
    """
    credentials = serializers.JSONField(default=dict)

    class Meta:
        model = Channel
        fields = ['id', 'name', 'type', 'credentials', 'is_active', 'created_at']
        read_only_fields = ['id', 'created_at']

    def to_representation(self, instance):
        rep = super().to_representation(instance)
        masked = {}
        for key, value in (rep.get('credentials') or {}).items():
            if key in SECRET_FIELDS and value:
                masked[key] = '••••••••'
            else:
                masked[key] = value
        rep['credentials'] = masked
        return rep

    def create(self, validated_data):
        creds = validated_data.get('credentials', {})
        # Auto-generate widget_key for website channels if not provided
        if validated_data.get('type') == 'website' and not creds.get('widget_key'):
            creds['widget_key'] = 'web_' + secrets.token_hex(20)
            validated_data['credentials'] = creds
        return super().create(validated_data)

    def update(self, instance, validated_data):
        incoming_creds = validated_data.pop('credentials', {})
        existing_creds = instance.credentials or {}

        # Merge: blank value = keep existing secret; new value = overwrite
        merged = dict(existing_creds)
        for key, value in incoming_creds.items():
            if key in SECRET_FIELDS and not value:
                continue  # keep existing secret
            merged[key] = value

        validated_data['credentials'] = merged
        return super().update(instance, validated_data)


class ContactSerializer(serializers.ModelSerializer):
    class Meta:
        model = Contact
        fields = '__all__'


class MessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = Message
        fields = '__all__'


class ConversationSerializer(serializers.ModelSerializer):
    messages = MessageSerializer(many=True, read_only=True)
    contact = ContactSerializer(read_only=True)
    assigned_to_name = serializers.SerializerMethodField()

    class Meta:
        model = Conversation
        fields = '__all__'

    def get_assigned_to_name(self, obj):
        return obj.assigned_to.name if obj.assigned_to else None
