from django.contrib import admin

from .models import Agent, Membership, Organization, SLAAlert, Workspace


class MembershipInline(admin.TabularInline):
    model = Membership
    extra = 0
    autocomplete_fields = ('user',)


@admin.register(Organization)
class OrganizationAdmin(admin.ModelAdmin):
    list_display = ('name', 'slug', 'is_active', 'members', 'conversations', 'created_at')
    list_filter = ('is_active',)
    search_fields = ('name', 'slug')
    prepopulated_fields = {'slug': ('name',)}
    inlines = [MembershipInline]

    @admin.display(description='Usuarios')
    def members(self, obj):
        return obj.memberships.count()

    @admin.display(description='Conversaciones')
    def conversations(self, obj):
        from conversations.models import Conversation
        return Conversation.objects.filter(organization=obj).count()


@admin.register(Membership)
class MembershipAdmin(admin.ModelAdmin):
    list_display = ('user', 'organization', 'role', 'is_default', 'created_at')
    list_filter = ('organization', 'role')
    search_fields = ('user__username', 'user__email', 'organization__name')
    autocomplete_fields = ('user', 'organization')


@admin.register(Workspace)
class WorkspaceAdmin(admin.ModelAdmin):
    list_display = ('organization', 'company_name', 'sla_warning_minutes',
                    'sla_critical_minutes', 'sla_escalate_minutes',
                    'escalation_email', 'relevance_filter_enabled', 'max_custom_tools')
    list_filter = ('relevance_filter_enabled', 'escalation_enabled')
    search_fields = ('company_name', 'organization__name')


@admin.register(Agent)
class AgentAdmin(admin.ModelAdmin):
    list_display = ('name', 'organization', 'role', 'availability', 'is_active', 'max_concurrent')
    list_filter = ('organization', 'role', 'availability', 'is_active')
    filter_horizontal = ('channels',)
    search_fields = ('display_name', 'user__username', 'user__email')


@admin.register(SLAAlert)
class SLAAlertAdmin(admin.ModelAdmin):
    list_display = ('conversation', 'organization', 'level', 'wait_minutes',
                    'triggered_at', 'email_sent', 'resolved')
    list_filter = ('organization', 'level', 'resolved', 'email_sent')
