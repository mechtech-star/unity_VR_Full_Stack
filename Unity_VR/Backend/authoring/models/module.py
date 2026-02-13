import uuid
from django.db import models
from django.utils.text import slugify
from .asset import Asset


class Module(models.Model):
    STATUS_CHOICES = (
        ("draft", "Draft"),
        ("published", "Published"),
    )
    MODE_CHOICES = (
        ("VR", "Virtual Reality"),
        ("AR", "Augmented Reality"),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    module_id = models.CharField(
        max_length=50, unique=True, blank=True,
        help_text="Human-readable module identifier (e.g., PUMP_MAINT_001). Auto-generated if blank."
    )
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True, default="")
    version = models.CharField(max_length=20, default="1.0")
    mode = models.CharField(max_length=10, choices=MODE_CHOICES, default="VR")
    estimated_duration_min = models.PositiveIntegerField(default=0)
    language = models.CharField(max_length=10, default="en")
    icon = models.CharField(max_length=10, blank=True, default="")
    thumbnail = models.ForeignKey(
        Asset, null=True, blank=True, on_delete=models.SET_NULL,
        related_name="thumbnail_for_modules"
    )
    tags = models.JSONField(default=list, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="draft")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def save(self, *args, **kwargs):
        if not self.module_id:
            base = slugify(self.title).upper().replace("-", "_")[:30] or "MODULE"
            candidate = base
            counter = 1
            while Module.objects.filter(module_id=candidate).exclude(pk=self.pk).exists():
                candidate = f"{base}_{counter:03d}"
                counter += 1
            self.module_id = candidate
        super().save(*args, **kwargs)

    def __str__(self) -> str:
        return f"Module({self.module_id}: {self.title})"
