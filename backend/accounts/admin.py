from django.contrib import admin

from .models import Agent, SLAAlert, Workspace


@admin.register(Workspace)
class WorkspaceAdmin(admin.ModelAdmin):
    list_display = ('company_name', 'sla_warning_minutes', 'sla_critical_minutes',
                    'sla_escalate_minutes', 'escalation_email', 'relevance_filter_enabled')

    def has_add_permission(self, request):
        return not Workspace.objects.exists()

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(Agent)
class AgentAdmin(admin.ModelAdmin):
    list_display = ('name', 'role', 'availability', 'is_active', 'max_concurrent')
    list_filter = ('role', 'availability', 'is_active')
    filter_horizontal = ('channels',)
    search_fields = ('display_name', 'user__username', 'user__email')


@admin.register(SLAAlert)
class SLAAlertAdmin(admin.ModelAdmin):
    list_display = ('conversation', 'level', 'wait_minutes', 'triggered_at',
                    'email_sent', 'resolved')
    list_filter = ('level', 'resolved', 'email_sent')
