# Generated by Django 3.2.7 on 2021-10-20 12:36

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('numbas_lti', '0069_filereport'),
    ]

    operations = [
        migrations.AlterModelOptions(
            name='filereport',
            options={'ordering': ('-creation_time',), 'verbose_name': 'Report file', 'verbose_name_plural': 'Report files'},
        ),
        migrations.AlterField(
            model_name='filereport',
            name='status',
            field=models.CharField(choices=[('inprogress', 'In progress'), ('complete', 'Complete'), ('error', 'Error')], default='inprogress', max_length=10),
        ),
    ]
