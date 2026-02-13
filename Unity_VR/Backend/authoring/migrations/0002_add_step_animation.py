from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("authoring", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="step",
            name="animation",
            field=models.CharField(max_length=200, null=True, blank=True),
        ),
    ]
