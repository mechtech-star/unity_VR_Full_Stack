import os
import uuid
from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import FileExtensionValidator
from django.db import models


ASSET_TYPE_CHOICES = (
    ("image", "Image"),
    ("audio", "Audio"),
    ("video", "Video"),
    ("gltf", "GLTF"),
    ("model", "Model"),
    ("other", "Other"),
)


def asset_upload_to(instance: "Asset", filename: str) -> str:
    # Preserve original extension and store under /media/assets/{asset_type}/{uuid}/original.{ext}
    ext = os.path.splitext(filename)[1].lower()
    return f"assets/{instance.type}/{instance.id}/original{ext}"


def validate_asset_size(file_obj) -> None:
    max_bytes = getattr(settings, "ASSET_MAX_UPLOAD_BYTES", 104857600)
    if file_obj.size > max_bytes:
        raise ValidationError(f"File exceeds max size of {max_bytes} bytes")


def validate_asset_extension(file_obj) -> None:
    ext = os.path.splitext(file_obj.name)[1].lower()
    allowed_map = getattr(settings, "ALLOWED_ASSET_EXTENSIONS", {})
    allowed = set().union(*allowed_map.values()) if allowed_map else set()
    if allowed and ext not in allowed:
        raise ValidationError(f"Unsupported file extension: {ext}")


class Asset(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    file = models.FileField(
        upload_to=asset_upload_to,
        validators=[validate_asset_size, validate_asset_extension],
    )
    original_filename = models.CharField(max_length=255)
    type = models.CharField(max_length=10, choices=ASSET_TYPE_CHOICES)
    mime_type = models.CharField(max_length=100)
    size_bytes = models.BigIntegerField()
    metadata = models.JSONField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def clean(self):
        # Validate extension against declared type for safety
        ext = os.path.splitext(self.original_filename or self.file.name)[1].lower()
        allowed_map = getattr(settings, "ALLOWED_ASSET_EXTENSIONS", {})
        type_allowed = allowed_map.get(self.type)
        if type_allowed and ext not in type_allowed:
            raise ValidationError({"file": f"Extension {ext} not allowed for type {self.type}"})

    def __str__(self) -> str:  # pragma: no cover - simple repr
        return f"Asset({self.id}, {self.original_filename})"


# Ensure underlying files are removed from storage when Asset records change or are deleted.
from django.db.models.signals import post_delete, pre_save
from django.dispatch import receiver


@receiver(post_delete, sender=Asset)
def _delete_asset_file_on_delete(sender, instance: Asset, **kwargs):
    """Delete file from storage when Asset is deleted."""
    try:
        if instance.file:
            instance.file.delete(save=False)
    except Exception:
        # Be conservative in signal handlers; log elsewhere if needed
        pass


@receiver(pre_save, sender=Asset)
def _delete_old_file_on_change(sender, instance: Asset, **kwargs):
    """When an Asset's `file` is replaced, delete the old file from storage.

    This handles the in-place update case (same DB row, new upload). If your
    replacement flow creates a new Asset row and then deletes the old one,
    `post_delete` will handle cleanup; this pre-save covers updates of the
    existing Asset instance.
    """
    if not instance.pk:
        return
    try:
        old = Asset.objects.get(pk=instance.pk)
    except Asset.DoesNotExist:
        return
    old_file = old.file
    new_file = instance.file
    try:
        # If the file field changed, delete the previous file
        if old_file and old_file.name and old_file.name != (new_file.name if new_file else None):
            old_file.delete(save=False)
    except Exception:
        pass
