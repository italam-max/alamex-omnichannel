from django.db import models


class KnowledgeDoc(models.Model):
    DOC_TYPE_CHOICES = [
        ('overview', 'Descripción general'),
        ('product', 'Producto'),
        ('pricing', 'Precios'),
        ('faq', 'FAQ'),
        ('template', 'Plantilla'),
    ]
    title = models.CharField(max_length=300)
    content = models.TextField()
    doc_type = models.CharField(max_length=20, choices=DOC_TYPE_CHOICES, default='overview')
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"[{self.doc_type}] {self.title}"
