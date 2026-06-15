from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('documents', '0005_inserted_citation'),
    ]

    operations = [
        migrations.AlterField(
            model_name='document',
            name='citation_style',
            field=models.CharField(default='apa', max_length=64),
        ),
    ]
