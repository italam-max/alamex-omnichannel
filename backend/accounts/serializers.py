from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

from conversations.models import Channel
from .models import Agent, SLAAlert, Workspace

User = get_user_model()


class WorkspaceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Workspace
        fields = [
            'id', 'company_name',
            'sla_warning_minutes', 'sla_critical_minutes', 'sla_escalate_minutes',
            'escalation_enabled', 'escalation_email', 'alert_on_dashboard', 'auto_reassign',
            'relevance_filter_enabled', 'updated_at',
        ]
        read_only_fields = ['id', 'updated_at']

    def validate(self, attrs):
        # Resolve effective values against the existing instance for partial updates.
        warn = attrs.get('sla_warning_minutes',  getattr(self.instance, 'sla_warning_minutes', 5))
        crit = attrs.get('sla_critical_minutes', getattr(self.instance, 'sla_critical_minutes', 10))
        esc  = attrs.get('sla_escalate_minutes', getattr(self.instance, 'sla_escalate_minutes', 15))
        if not (warn < crit < esc):
            raise serializers.ValidationError(
                'Los umbrales SLA deben ser crecientes: Aviso < Crítico < Escalada.')
        return attrs


class AgentSerializer(serializers.ModelSerializer):
    # User fields surfaced flat
    username   = serializers.CharField(source='user.username', read_only=True)
    email      = serializers.EmailField(source='user.email', read_only=True)
    name       = serializers.CharField(read_only=True)
    initials   = serializers.CharField(read_only=True)
    permissions = serializers.DictField(read_only=True)
    active_conversation_count = serializers.IntegerField(read_only=True)
    channel_ids = serializers.PrimaryKeyRelatedField(
        many=True, queryset=Channel.objects.all(), source='channels', required=False)

    # Write-only credentials for creating the underlying auth user
    new_email     = serializers.EmailField(write_only=True, required=False)
    new_password  = serializers.CharField(write_only=True, required=False, style={'input_type': 'password'})

    class Meta:
        model = Agent
        fields = [
            'id', 'username', 'email', 'name', 'initials', 'display_name', 'phone',
            'role', 'availability', 'max_concurrent', 'is_active',
            'channel_ids', 'permissions', 'active_conversation_count',
            'created_at', 'updated_at',
            'new_email', 'new_password',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def create(self, validated_data):
        email    = validated_data.pop('new_email', None)
        password = validated_data.pop('new_password', None)
        channels = validated_data.pop('channels', [])
        display  = validated_data.get('display_name', '')

        if not email:
            raise serializers.ValidationError({'new_email': 'Requerido para crear un agente.'})
        if not password:
            raise serializers.ValidationError({'new_password': 'Requerido para crear un agente.'})
        validate_password(password)

        if User.objects.filter(username=email).exists():
            raise serializers.ValidationError({'new_email': 'Ya existe un usuario con ese correo.'})

        user = User.objects.create_user(
            username=email, email=email, password=password,
            first_name=display.split(' ')[0] if display else '',
        )
        agent = Agent.objects.create(user=user, **validated_data)
        if channels:
            agent.channels.set(channels)
        return agent

    def update(self, instance, validated_data):
        validated_data.pop('new_email', None)
        password = validated_data.pop('new_password', None)
        channels = validated_data.pop('channels', None)

        if password:
            validate_password(password)
            instance.user.set_password(password)
            instance.user.save(update_fields=['password'])

        for field, value in validated_data.items():
            setattr(instance, field, value)
        instance.save()

        if channels is not None:
            instance.channels.set(channels)
        return instance


class SLAAlertSerializer(serializers.ModelSerializer):
    contact_name = serializers.SerializerMethodField()
    channel_type = serializers.SerializerMethodField()
    assigned_to_name = serializers.SerializerMethodField()

    class Meta:
        model = SLAAlert
        fields = [
            'id', 'conversation', 'level', 'wait_minutes', 'triggered_at',
            'email_sent', 'email_to', 'acknowledged', 'resolved',
            'contact_name', 'channel_type', 'assigned_to_name',
        ]
        read_only_fields = fields

    def get_contact_name(self, obj):
        try:
            return obj.conversation.contact.name
        except Exception:
            return 'Contacto'

    def get_channel_type(self, obj):
        try:
            return obj.conversation.channel.type
        except Exception:
            return 'website'

    def get_assigned_to_name(self, obj):
        a = obj.conversation.assigned_to
        return a.name if a else None
