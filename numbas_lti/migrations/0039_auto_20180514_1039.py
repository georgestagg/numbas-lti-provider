# Generated by Django 2.0 on 2018-05-14 10:39

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('numbas_lti', '0038_lticonsumer_url'),
    ]

    operations = [
        migrations.AlterModelOptions(
            name='editorlinkproject',
            options={'ordering': ['name']},
        ),
    ]
