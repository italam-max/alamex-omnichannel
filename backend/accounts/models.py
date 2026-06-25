"""
Team, roles and configurable business rules.

Single-tenant for now (Workspace is a pk=1 singleton), but org-ready: when
multi-tenancy is added, give Workspace an `organization` FK and point every
other model at it instead of relying on the solo row.

Nothing here is hardcoded into business logic — SLA thresholds, escalation
email, dashboard alerts and the relevance/anti-spam gate all live in Workspace
and are edited from the admin UI.
"""
from decimal import Decimal

from django.conf import settings
from django.db import models


# ── Workspace: the configurable business-rules record ─────────────────────────

class Workspace(models.Model):
    """Singleton (pk=1). Holds every per-company business rule."""

    company_name = models.CharField(max_length=200, default='Mi Empresa')

    # ── SLA thresholds for human-takeover response time (minutes) ──
    # A conversation waiting for a human escalates through these tiers.
    sla_warning_minutes   = models.PositiveIntegerField(
        default=5,  help_text='Minutos sin respuesta para marcar "Aviso".')
    sla_critical_minutes  = models.PositiveIntegerField(
        default=10, help_text='Minutos sin respuesta para marcar "Crítico".')
    sla_escalate_minutes  = models.PositiveIntegerField(
        default=15, help_text='Minutos sin respuesta para "Escalada" (dispara alertas).')

    # ── Escalation actions ──
    escalation_enabled    = models.BooleanField(default=True)
    escalation_email      = models.EmailField(
        blank=True, help_text='Correo que recibe la alerta cuando vence el SLA.')
    alert_on_dashboard    = models.BooleanField(
        default=True, help_text='Mostrar las escaladas en el dashboard del admin.')
    auto_reassign         = models.BooleanField(
        default=False, help_text='Reasignar automáticamente al agente libre con menos carga.')

    # ── Relevance / anti-spam gate (LangGraph) ──
    relevance_filter_enabled = models.BooleanField(
        default=True,
        help_text='La IA no responde a mensajes irrelevantes o spam (acuses, emojis sueltos, etc.).')

    # ── Custom tools (orchestrator guardrails) ──────────────────────
    max_custom_tools  = models.PositiveIntegerField(
        default=10, help_text='Tope de herramientas personalizadas por el plan.')
    tool_run_cost_usd = models.DecimalField(
        max_digits=8, decimal_places=6, default=Decimal('0.002000'),
        help_text='Costo cobrado por cada ejecución de un webhook saliente.')
    webhook_domain_allowlist = models.TextField(
        blank=True,
        help_text='Dominios permitidos para webhooks (coma-separado). Vacío = cualquiera (HTTPS, no privado).')

    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Workspace (reglas de negocio)'

    def __str__(self):
        return f'Workspace: {self.company_name}'

    @classmethod
    def get_solo(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj

    def tier_for_wait(self, wait_minutes: int) -> str:
        """Map an elapsed wait (minutes) to an SLA tier name."""
        if wait_minutes >= self.sla_escalate_minutes:
            return 'escalated'
        if wait_minutes >= self.sla_critical_minutes:
            return 'critical'
        if wait_minutes >= self.sla_warning_minutes:
            return 'warning'
        return 'ok'


# ── Agent: a human team member ────────────────────────────────────────────────

class Agent(models.Model):
    ROLE_ADMIN      = 'admin'
    ROLE_SUPERVISOR = 'supervisor'
    ROLE_AGENT      = 'agent'
    ROLE_CHOICES = [
        (ROLE_ADMIN,      'Administrador'),
        (ROLE_SUPERVISOR, 'Supervisor'),
        (ROLE_AGENT,      'Agente'),
    ]

    AVAIL_ONLINE = 'online'
    AVAIL_BUSY   = 'busy'
    AVAIL_AWAY   = 'away'
    AVAILABILITY_CHOICES = [
        (AVAIL_ONLINE, 'En línea'),
        (AVAIL_BUSY,   'Ocupado'),
        (AVAIL_AWAY,   'Ausente'),
    ]

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='agent_profile')
    role = models.CharField(max_length=12, choices=ROLE_CHOICES, default=ROLE_AGENT)
    display_name = models.CharField(max_length=120, blank=True)
    phone = models.CharField(max_length=30, blank=True)

    # Which channels this agent may attend.
    channels = models.ManyToManyField(
        'conversations.Channel', blank=True, related_name='agents')

    availability   = models.CharField(max_length=10, choices=AVAILABILITY_CHOICES, default=AVAIL_AWAY)
    max_concurrent = models.PositiveIntegerField(
        default=5, help_text='Máximo de conversaciones activas simultáneas.')

    # "Dar de baja" = is_active False (soft delete, preserves history).
    is_active  = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['display_name', 'id']

    def __str__(self):
        return f'{self.name} ({self.get_role_display()})'

    @property
    def name(self) -> str:
        return self.display_name or self.user.get_full_name() or self.user.username

    @property
    def initials(self) -> str:
        parts = self.name.split()
        return ''.join(p[0] for p in parts[:2]).upper() or '?'

    @property
    def active_conversation_count(self) -> int:
        return self.conversations.filter(status__in=['active', 'human_takeover']).count()

    @property
    def permissions(self) -> dict:
        """Capability map derived from role — consumed by the frontend."""
        is_admin = self.role == self.ROLE_ADMIN
        is_sup   = self.role in (self.ROLE_ADMIN, self.ROLE_SUPERVISOR)
        return {
            'manage_agents':     is_admin,
            'configure_rules':   is_admin,
            'manage_channels':   is_admin,
            'view_all_convs':    is_sup,
            'reassign':          is_sup,
            'view_billing':      is_admin,
            'attend_convs':      True,
        }


# ── SLAAlert: an escalation event ─────────────────────────────────────────────

class SLAAlert(models.Model):
    LEVEL_CHOICES = [
        ('warning',   'Aviso'),
        ('critical',  'Crítico'),
        ('escalated', 'Escalada'),
    ]
    conversation = models.ForeignKey(
        'conversations.Conversation', on_delete=models.CASCADE, related_name='sla_alerts')
    level        = models.CharField(max_length=10, choices=LEVEL_CHOICES)
    wait_minutes = models.PositiveIntegerField(default=0)
    triggered_at = models.DateTimeField(auto_now_add=True)

    # Email notification bookkeeping
    email_sent = models.BooleanField(default=False)
    email_to   = models.EmailField(blank=True)

    # Resolution
    acknowledged    = models.BooleanField(default=False)
    acknowledged_by = models.ForeignKey(
        Agent, null=True, blank=True, on_delete=models.SET_NULL, related_name='acknowledged_alerts')
    resolved        = models.BooleanField(default=False)

    class Meta:
        ordering = ['-triggered_at']
        indexes = [models.Index(fields=['resolved', '-triggered_at'])]

    def __str__(self):
        return f'SLA[{self.level}] conv={self.conversation_id} {self.wait_minutes}min'
