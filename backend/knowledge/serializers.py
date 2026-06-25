from rest_framework import serializers
from .models import KnowledgeDoc, AIConfig, CustomTool, CustomToolRun, RESERVED_TOOL_NAMES, TOOL_NAME_RE

_VALID_PARAM_TYPES = {'string', 'number', 'integer', 'boolean'}


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


class CustomToolSerializer(serializers.ModelSerializer):
    archetype_label = serializers.CharField(source='get_archetype_display', read_only=True)
    needs_review    = serializers.BooleanField(read_only=True)
    run_count       = serializers.SerializerMethodField()

    class Meta:
        model = CustomTool
        fields = [
            'id', 'name', 'display_name', 'description', 'archetype', 'archetype_label',
            'parameters', 'config', 'is_active', 'review_status', 'needs_review',
            'run_count', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'review_status', 'created_at', 'updated_at']

    def get_run_count(self, obj):
        return obj.runs.count() if obj.pk else 0

    def validate_name(self, value):
        value = (value or '').strip().lower()
        if not TOOL_NAME_RE.match(value):
            raise serializers.ValidationError('Usa snake_case: 3-41 letras/números/_ , empieza con letra.')
        if value in RESERVED_TOOL_NAMES:
            raise serializers.ValidationError(f'"{value}" es una herramienta del sistema.')
        qs = CustomTool.objects.filter(name=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError('Ya existe una herramienta con ese nombre.')
        return value

    def validate_parameters(self, value):
        if not isinstance(value, list):
            raise serializers.ValidationError('Los parámetros deben ser una lista.')
        seen = set()
        for p in value:
            if not isinstance(p, dict) or not p.get('name'):
                raise serializers.ValidationError('Cada parámetro requiere un nombre.')
            pname = p['name']
            if not TOOL_NAME_RE.match(pname):
                raise serializers.ValidationError(f'Nombre de parámetro inválido: "{pname}".')
            if pname in seen:
                raise serializers.ValidationError(f'Parámetro duplicado: "{pname}".')
            seen.add(pname)
            if p.get('type', 'string') not in _VALID_PARAM_TYPES:
                raise serializers.ValidationError(f'Tipo inválido en "{pname}".')
        return value

    def validate(self, data):
        archetype = data.get('archetype', getattr(self.instance, 'archetype', None))
        config = data.get('config', getattr(self.instance, 'config', {}) or {})

        if archetype == CustomTool.ARCHETYPE_WEBHOOK:
            url = (config.get('url') or '').strip()
            if not url.startswith('https://'):
                raise serializers.ValidationError({'config': 'El webhook requiere una URL https://.'})
        if archetype == CustomTool.ARCHETYPE_CANNED:
            if not (config.get('text') or config.get('doc_id')):
                raise serializers.ValidationError({'config': 'Configura un texto o un documento.'})

        # Plan limit — only when creating a new tool.
        if self.instance is None:
            from accounts.models import Workspace
            limit = Workspace.get_solo().max_custom_tools
            if CustomTool.objects.count() >= limit:
                raise serializers.ValidationError(
                    f'Alcanzaste el límite de {limit} herramientas de tu plan.')
        return data

    def _enforce_review_gate(self, instance, validated):
        """External tools can't be activated until approved."""
        if instance.archetype in CustomTool.EXTERNAL_ARCHETYPES:
            if instance.is_active and instance.review_status != CustomTool.STATUS_APPROVED:
                instance.is_active = False
                if instance.review_status == CustomTool.STATUS_DRAFT:
                    instance.review_status = CustomTool.STATUS_PENDING
                instance.save(update_fields=['is_active', 'review_status'])

    def create(self, validated):
        instance = super().create(validated)
        self._enforce_review_gate(instance, validated)
        return instance

    def update(self, instance, validated):
        instance = super().update(instance, validated)
        self._enforce_review_gate(instance, validated)
        return instance


class CustomToolRunSerializer(serializers.ModelSerializer):
    class Meta:
        model = CustomToolRun
        fields = ['id', 'tool', 'tool_name', 'conversation_id', 'arguments',
                  'status', 'result', 'cost_usd', 'created_at']
        read_only_fields = fields
