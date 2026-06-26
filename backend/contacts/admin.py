from django.contrib import admin

from .models import FollowUp, Lead


@admin.register(Lead)
class LeadAdmin(admin.ModelAdmin):
    list_display = ('contact', 'organization', 'stage', 'created_at')
    list_filter = ('organization', 'stage')
    search_fields = ('contact__name', 'organization__name')


@admin.register(FollowUp)
class FollowUpAdmin(admin.ModelAdmin):
    list_display = ('conversation', 'organization', 'priority', 'status', 'created_at')
    list_filter = ('organization', 'status', 'priority')
