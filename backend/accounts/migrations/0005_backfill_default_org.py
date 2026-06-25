"""
M2 — backfill: create the default organization, stamp every existing row to it,
create a Membership for every user, and set Agent.organization. Runs after the
nullable `organization` columns exist (M1) and before they're flipped to NOT
NULL (M3). Idempotent and safe to re-run.
"""
from django.db import migrations
from django.utils.text import slugify

# (app_label, model_name) for every tenant-owned table that got an org FK.
TENANT_MODELS = [
    ('accounts', 'Workspace'), ('accounts', 'Agent'), ('accounts', 'SLAAlert'),
    ('billing', 'CreditAccount'), ('billing', 'CreditTransaction'),
    ('contacts', 'Lead'), ('contacts', 'FollowUp'),
    ('conversations', 'Channel'), ('conversations', 'Contact'),
    ('conversations', 'Conversation'), ('conversations', 'Message'),
    ('integrations', 'Integration'), ('integrations', 'Quote'),
    ('knowledge', 'AIConfig'), ('knowledge', 'KnowledgeDoc'),
    ('knowledge', 'CustomTool'), ('knowledge', 'CustomToolRun'),
]


def backfill(apps, schema_editor):
    Organization = apps.get_model('accounts', 'Organization')
    Membership = apps.get_model('accounts', 'Membership')
    Workspace = apps.get_model('accounts', 'Workspace')
    Agent = apps.get_model('accounts', 'Agent')
    User = apps.get_model('auth', 'User')

    # Derive the default org name/slug from the existing Workspace, if any.
    ws = Workspace.objects.order_by('pk').first()
    name = (ws.company_name if ws and ws.company_name else 'Almenara')
    slug = slugify(name) or 'almenara'
    org, _ = Organization.objects.get_or_create(slug=slug, defaults={'name': name})

    # Stamp every existing tenant-owned row to the default org.
    for app_label, model_name in TENANT_MODELS:
        Model = apps.get_model(app_label, model_name)
        Model.objects.filter(organization__isnull=True).update(organization=org)

    # One membership per user (role from their Agent if present).
    for user in User.objects.all():
        agent = Agent.objects.filter(user=user).first()
        role = agent.role if agent else ('admin' if user.is_superuser else 'agent')
        Membership.objects.get_or_create(
            user=user, organization=org,
            defaults={'role': role, 'is_default': True},
        )
        if agent and agent.organization_id is None:
            agent.organization = org
            agent.save(update_fields=['organization'])


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0004_agent_organization_slaalert_organization_and_more'),
        ('billing', '0002_creditaccount_organization_and_more'),
        ('contacts', '0002_followup_organization_lead_organization'),
        ('conversations', '0004_channel_organization_contact_organization_and_more'),
        ('integrations', '0002_integration_organization_quote_organization'),
        ('knowledge', '0006_aiconfig_organization_customtool_organization_and_more'),
    ]

    operations = [
        migrations.RunPython(backfill, migrations.RunPython.noop),
    ]
