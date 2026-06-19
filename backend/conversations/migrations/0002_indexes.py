from django.contrib.postgres.indexes import GinIndex
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('conversations', '0001_initial'),
    ]

    operations = [
        # GIN index on Channel.credentials allows JSONField lookups without table scan
        migrations.AddIndex(
            model_name='channel',
            index=GinIndex(fields=['credentials'], name='channel_credentials_gin'),
        ),
        # Composite index for the most common Conversation query pattern
        migrations.AddIndex(
            model_name='conversation',
            index=models.Index(
                fields=['contact', 'channel', 'status'],
                name='conv_contact_channel_status',
            ),
        ),
        migrations.AddIndex(
            model_name='conversation',
            index=models.Index(fields=['-updated_at'], name='conv_updated_at_desc'),
        ),
    ]
