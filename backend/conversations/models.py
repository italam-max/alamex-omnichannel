from django.contrib.postgres.indexes import GinIndex
from django.db import models
from accounts.tenancy import TenantOwned


class Channel(TenantOwned):
    TYPE_CHOICES = [
        ('whatsapp', 'WhatsApp'),
        ('messenger', 'Messenger'),
        ('instagram', 'Instagram'),
        ('website', 'Website Widget'),
    ]
    name = models.CharField(max_length=100)
    type = models.CharField(max_length=20, choices=TYPE_CHOICES)
    credentials = models.JSONField(default=dict)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        # GIN index on credentials allows JSONField lookups without table scan
        indexes = [GinIndex(fields=['credentials'], name='channel_credentials_gin')]

    def __str__(self):
        return f"{self.name} ({self.type})"


class Contact(TenantOwned):
    name = models.CharField(max_length=200)
    phone = models.CharField(max_length=30, blank=True)
    email = models.EmailField(blank=True)
    channel = models.ForeignKey(Channel, on_delete=models.SET_NULL, null=True, related_name='contacts')
    external_id = models.CharField(max_length=200, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            # A contact's external id is unique within (org, channel).
            models.UniqueConstraint(
                fields=['organization', 'channel', 'external_id'],
                condition=~models.Q(external_id=''),
                name='uniq_contact_org_channel_external',
            ),
        ]

    def __str__(self):
        return self.name


class Conversation(TenantOwned):
    STATUS_CHOICES = [
        ('active', 'Activa'),
        ('human_takeover', 'Atención humana'),
        ('blocked', 'Bloqueada'),
    ]
    channel = models.ForeignKey(Channel, on_delete=models.SET_NULL, null=True, related_name='conversations')
    contact = models.ForeignKey(Contact, on_delete=models.CASCADE, related_name='conversations')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='active')
    ai_active = models.BooleanField(default=True)
    # Human agent currently responsible (set on takeover / reassignment).
    assigned_to = models.ForeignKey(
        'accounts.Agent', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='conversations')
    assigned_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=['contact', 'channel', 'status'], name='conv_contact_channel_status'),
            models.Index(fields=['-updated_at'], name='conv_updated_at_desc'),
        ]

    def __str__(self):
        return f"Conv {self.id} — {self.contact}"


class Message(TenantOwned):
    ROLE_CHOICES = [
        ('customer', 'Cliente'),
        ('ai', 'IA'),
        ('agent', 'Agente'),
    ]
    conversation = models.ForeignKey(Conversation, on_delete=models.CASCADE, related_name='messages')
    role = models.CharField(max_length=10, choices=ROLE_CHOICES)
    content = models.TextField()
    model_used = models.CharField(max_length=100, blank=True)
    delivered_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']

    def __str__(self):
        return f"[{self.role}] {self.content[:60]}"
