from django.db import migrations, models
import django.db.models.deletion
import uuid
from authoring.models.asset import asset_upload_to, validate_asset_extension, validate_asset_size


class Migration(migrations.Migration):
    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name="Asset",
            fields=[
                ("id", models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, serialize=False)),
                ("file", models.FileField(upload_to=asset_upload_to, validators=[validate_asset_size, validate_asset_extension])),
                ("original_filename", models.CharField(max_length=255)),
                ("type", models.CharField(choices=[("image", "Image"), ("audio", "Audio"), ("video", "Video"), ("gltf", "GLTF"), ("model", "Model"), ("other", "Other")], max_length=10)),
                ("mime_type", models.CharField(max_length=100)),
                ("size_bytes", models.BigIntegerField()),
                ("metadata", models.JSONField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
            options={"ordering": ["-created_at"]},
        ),
        migrations.CreateModel(
            name="Module",
            fields=[
                ("id", models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, serialize=False)),
                ("title", models.CharField(max_length=200)),
                ("description", models.TextField(blank=True, null=True)),
                ("status", models.CharField(choices=[("draft", "Draft"), ("published", "Published")], default="draft", max_length=20)),
                ("version", models.PositiveIntegerField(default=1)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("cover_asset", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="cover_for_modules", to="authoring.asset")),
            ],
            options={"ordering": ["-created_at"]},
        ),
        migrations.CreateModel(
            name="Step",
            fields=[
                ("id", models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, serialize=False)),
                ("order_index", models.PositiveIntegerField()),
                ("title", models.CharField(max_length=200)),
                ("body", models.TextField()),
                ("required", models.BooleanField(default=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("module", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="steps", to="authoring.module")),
            ],
            options={"ordering": ["order_index"]},
        ),
        migrations.CreateModel(
            name="StepAsset",
            fields=[
                ("id", models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, serialize=False)),
                ("priority", models.IntegerField(default=0)),
                ("asset", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="asset_steps", to="authoring.asset")),
                ("step", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="step_assets", to="authoring.step")),
            ],
            options={"ordering": ["priority", "id"]},
        ),
        migrations.CreateModel(
            name="PublishedModule",
            fields=[
                ("id", models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, serialize=False)),
                ("version", models.PositiveIntegerField()),
                ("schema_version", models.PositiveIntegerField(default=1)),
                ("payload", models.JSONField()),
                ("published_at", models.DateTimeField(auto_now_add=True)),
                ("module", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="published_versions", to="authoring.module")),
            ],
            options={"ordering": ["-published_at"]},
        ),
        migrations.AddConstraint(
            model_name="step",
            constraint=models.UniqueConstraint(fields=("module", "order_index"), name="unique_step_order_per_module"),
        ),
        migrations.AddConstraint(
            model_name="stepasset",
            constraint=models.UniqueConstraint(fields=("step", "asset"), name="unique_asset_per_step"),
        ),
        migrations.AddConstraint(
            model_name="publishedmodule",
            constraint=models.UniqueConstraint(fields=("module", "version"), name="unique_published_version"),
        ),
    ]
