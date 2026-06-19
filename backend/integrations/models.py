from django.db import models
from conversations.models import Contact, Conversation


class Integration(models.Model):
    TYPE_CHOICES = [
        ('odoo', 'Odoo'),
        ('evolution_api', 'Evolution API'),
    ]
    name = models.CharField(max_length=100)
    type = models.CharField(max_length=20, choices=TYPE_CHOICES)
    config = models.JSONField(default=dict)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.name} ({self.type})"


class Quote(models.Model):
    STATUS_CHOICES = [
        ('draft', 'Borrador'),
        ('sent', 'Enviada'),
        ('accepted', 'Aceptada'),
    ]
    contact = models.ForeignKey(Contact, on_delete=models.CASCADE, related_name='quotes')
    conversation = models.ForeignKey(Conversation, on_delete=models.SET_NULL, null=True, blank=True, related_name='quotes')
    items = models.JSONField(default=list)
    total = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='draft')
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Cotización {self.id} — {self.contact} ({self.status})"
