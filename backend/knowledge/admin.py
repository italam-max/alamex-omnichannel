from django.contrib import admin

from .models import AIConfig, CustomTool, CustomToolRun, KnowledgeDoc


@admin.register(KnowledgeDoc)
class KnowledgeDocAdmin(admin.ModelAdmin):
    list_display = ('title', 'organization', 'is_active', 'order', 'updated_at')
    list_filter = ('organization', 'is_active')
    search_fields = ('title', 'organization__name')


@admin.register(CustomTool)
class CustomToolAdmin(admin.ModelAdmin):
    list_display = ('name', 'organization', 'archetype', 'is_active', 'review_status')
    list_filter = ('organization', 'archetype', 'is_active', 'review_status')
    search_fields = ('name', 'organization__name')


@admin.register(AIConfig)
class AIConfigAdmin(admin.ModelAdmin):
    list_display = ('organization', 'agent_name', 'company_name', 'language_policy', 'updated_at')
    search_fields = ('organization__name', 'company_name')


@admin.register(CustomToolRun)
class CustomToolRunAdmin(admin.ModelAdmin):
    list_display = ('tool_name', 'organization', 'status', 'cost_usd', 'created_at')
    list_filter = ('organization', 'status')
    date_hierarchy = 'created_at'
