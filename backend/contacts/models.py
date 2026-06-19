from django.db import models
from conversations.models import Contact as ConvContact, Conversation


class Lead(models.Model):
    STAGE_CHOICES = [
        ('new', 'Nuevo'),
        ('contacted', 'Contactado'),
        ('qualified', 'Calificado'),
        ('proposal', 'Propuesta'),
        ('closed', 'Cerrado'),
    ]
    contact = models.ForeignKey(ConvContact, on_delete=models.CASCADE, related_name='leads')
    stage = models.CharField(max_length=20, choices=STAGE_CHOICES, default='new')
    owner = models.CharField(max_length=200, blank=True)
    value = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    tags = models.JSONField(default=list)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Lead {self.contact} — {self.stage}"


class FollowUp(models.Model):
    PRIORITY_CHOICES = [
        ('low', 'Baja'),
        ('medium', 'Media'),
        ('high', 'Alta'),
    ]
    STATUS_CHOICES = [
        ('open', 'Abierto'),
        ('in_progress', 'En progreso'),
        ('done', 'Hecho'),
        ('dismissed', 'Descartado'),
    ]
    conversation = models.ForeignKey(Conversation, on_delete=models.CASCADE, related_name='followups')
    reason = models.TextField()
    priority = models.CharField(max_length=10, choices=PRIORITY_CHOICES, default='medium')
    status = models.CharField(max_length=15, choices=STATUS_CHOICES, default='open')
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"FollowUp [{self.priority}] {self.reason[:60]}"
