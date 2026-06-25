from django.contrib import admin

from .models import Channel, Contact, Conversation, Message


@admin.register(Channel)
class ChannelAdmin(admin.ModelAdmin):
    list_display = ('name', 'type', 'organization', 'is_active', 'created_at')
    list_filter = ('organization', 'type', 'is_active')
    search_fields = ('name', 'organization__name')


@admin.register(Conversation)
class ConversationAdmin(admin.ModelAdmin):
    list_display = ('id', 'organization', 'contact', 'channel', 'status',
                    'ai_active', 'assigned_to', 'updated_at')
    list_filter = ('organization', 'status', 'ai_active')
    search_fields = ('contact__name', 'organization__name')
    date_hierarchy = 'created_at'


@admin.register(Contact)
class ContactAdmin(admin.ModelAdmin):
    list_display = ('name', 'organization', 'channel', 'external_id', 'created_at')
    list_filter = ('organization',)
    search_fields = ('name', 'external_id', 'organization__name')


@admin.register(Message)
class MessageAdmin(admin.ModelAdmin):
    list_display = ('id', 'organization', 'conversation', 'role', 'created_at')
    list_filter = ('organization', 'role')
