"""
The legacy singletons (Workspace, AIConfig, CreditAccount) were inserted with an
explicit pk=1, which does not advance the Postgres id sequence. Creating a second
per-org row would then collide on id=1. Reset those sequences to MAX(id).
"""
from django.db import migrations

TABLES = ['accounts_workspace', 'knowledge_aiconfig', 'billing_creditaccount']


def reset_sequences(apps, schema_editor):
    if schema_editor.connection.vendor != 'postgresql':
        return
    with schema_editor.connection.cursor() as cursor:
        for table in TABLES:
            cursor.execute(
                "SELECT setval(pg_get_serial_sequence(%s, 'id'), "
                "COALESCE((SELECT MAX(id) FROM " + table + "), 1))",
                [table],
            )


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0005_backfill_default_org'),
        ('knowledge', '0006_aiconfig_organization_customtool_organization_and_more'),
        ('billing', '0002_creditaccount_organization_and_more'),
    ]

    operations = [
        migrations.RunPython(reset_sequences, migrations.RunPython.noop),
    ]
