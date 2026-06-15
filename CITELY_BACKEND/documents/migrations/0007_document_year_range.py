from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('documents', '0006_document_citation_style_length'),
    ]

    operations = [
        migrations.AddField(
            model_name='document',
            name='year_from',
            field=models.PositiveIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='document',
            name='year_to',
            field=models.PositiveIntegerField(blank=True, null=True),
        ),
    ]
