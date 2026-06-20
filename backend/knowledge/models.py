from django.db import models


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

    # Global API key for scraper + default agent (SECRET — never returned plaintext)
    ai_api_key = models.TextField(blank=True)

    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'AI Configuration'

    @classmethod
    def get_solo(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj
