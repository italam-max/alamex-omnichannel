import re

from django.core.exceptions import ValidationError
from django.db import models

# Tool names reserved by the platform — custom tools may never shadow them.
RESERVED_TOOL_NAMES = {
    'search_knowledge_base', 'handoff_to_human', 'create_lead', 'create_followup',
}
TOOL_NAME_RE = re.compile(r'^[a-z][a-z0-9_]{2,40}$')


class KnowledgeDoc(models.Model):
    title = models.CharField(max_length=300)
    content = models.TextField()
    is_active = models.BooleanField(default=True)
    order = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['order', 'created_at']

    def __str__(self):
        return self.title


class AIConfig(models.Model):
    """Singleton — always pk=1. Stores the global AI persona + knowledge settings."""
    # Knowledge overview
    overview = models.TextField(blank=True)

    # Persona
    agent_name = models.CharField(max_length=100, default='Anna')
    agent_gender = models.CharField(
        max_length=10,
        choices=[('female', 'Femenino'), ('male', 'Masculino'), ('neutral', 'Neutro')],
        default='female',
    )
    company_name = models.CharField(max_length=100, blank=True)
    tone = models.CharField(max_length=300, blank=True)
    identity_line = models.TextField(blank=True)
    agent_description = models.TextField(blank=True)

    # Behavior rules — ordered list of strings
    behavior_rules = models.JSONField(default=list)

    # Language
    language_policy = models.CharField(
        max_length=50,
        choices=[('mirror', 'Espejo del cliente'), ('fixed', 'Idioma fijo')],
        default='mirror',
    )
    supported_languages = models.CharField(max_length=200, default='es, en')

    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'AI Configuration'

    @classmethod
    def get_solo(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj


class CustomTool(models.Model):
    """
    A tenant-defined agent tool. Declarative only — the tenant configures an
    instance of a platform-defined *archetype*; the agent never runs tenant code.
    The generic dispatcher (integrations.services.custom_tools) executes it.
    """
    ARCHETYPE_COLLECT  = 'collect_data'
    ARCHETYPE_TAG       = 'tag_route'
    ARCHETYPE_CANNED    = 'canned_response'
    ARCHETYPE_WEBHOOK   = 'webhook'
    ARCHETYPE_CHOICES = [
        (ARCHETYPE_COLLECT, 'Capturar datos'),
        (ARCHETYPE_TAG,     'Etiquetar / enrutar'),
        (ARCHETYPE_CANNED,  'Respuesta guiada'),
        (ARCHETYPE_WEBHOOK, 'Webhook saliente'),
    ]
    # Archetypes that reach an external network → need review before activation.
    EXTERNAL_ARCHETYPES = {ARCHETYPE_WEBHOOK}

    STATUS_DRAFT    = 'draft'
    STATUS_PENDING  = 'pending_review'
    STATUS_APPROVED = 'approved'
    STATUS_CHOICES = [
        (STATUS_DRAFT, 'Borrador'),
        (STATUS_PENDING, 'En revisión'),
        (STATUS_APPROVED, 'Aprobada'),
    ]

    name         = models.CharField(max_length=42)          # snake_case, LLM-facing
    display_name = models.CharField(max_length=120, blank=True)
    description  = models.TextField()                       # "cuándo usarla" — the LLM reads this
    archetype    = models.CharField(max_length=20, choices=ARCHETYPE_CHOICES)
    # [{name, type(string|number|integer|boolean), description, required, enum?}]
    parameters   = models.JSONField(default=list)
    # Archetype-specific settings (webhook url/method/headers, tag/priority, text…)
    config       = models.JSONField(default=dict)
    is_active     = models.BooleanField(default=False)
    review_status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_DRAFT)
    created_at    = models.DateTimeField(auto_now_add=True)
    updated_at    = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return f'{self.name} ({self.archetype})'

    @property
    def needs_review(self) -> bool:
        return self.archetype in self.EXTERNAL_ARCHETYPES

    def clean(self):
        if not TOOL_NAME_RE.match(self.name or ''):
            raise ValidationError({'name': 'Usa snake_case: 3-41 letras/números/_ , empieza con letra.'})
        if self.name in RESERVED_TOOL_NAMES:
            raise ValidationError({'name': f'"{self.name}" es una herramienta del sistema.'})
        # External tools may only be active once approved.
        if self.is_active and self.needs_review and self.review_status != self.STATUS_APPROVED:
            raise ValidationError({'is_active': 'Un webhook debe ser aprobado antes de activarse.'})


class CustomToolRun(models.Model):
    """Audit + data-capture record for every custom tool invocation."""
    STATUS_OK    = 'ok'
    STATUS_ERROR = 'error'

    tool          = models.ForeignKey(CustomTool, on_delete=models.SET_NULL, null=True, related_name='runs')
    tool_name     = models.CharField(max_length=42)         # denormalized (survives tool deletion)
    conversation_id = models.IntegerField(null=True, blank=True)
    arguments     = models.JSONField(default=dict)
    status        = models.CharField(max_length=10, default=STATUS_OK)
    result        = models.TextField(blank=True)
    cost_usd      = models.DecimalField(max_digits=12, decimal_places=6, default=0)
    created_at    = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.tool_name} [{self.status}]'
