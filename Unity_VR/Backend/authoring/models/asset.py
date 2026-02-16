import io
import os
import uuid
from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import FileExtensionValidator
from django.core.files.base import ContentFile
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


# ── Image format normalisation (WebP / GIF → PNG) ────────────────────
from django.db.models.signals import post_save


@receiver(post_save, sender=Asset)
def _normalise_image_format(sender, instance: Asset, created, **kwargs):
    """
    After an image asset is created, convert non-Unity-friendly formats
    (WebP, GIF) to PNG. Updates the file, mime_type, and original_filename
    in-place. Only fires for newly created assets with type == 'image'.
    """
    if not created:
        return

    if instance.type != "image":
        return

    if not instance.file:
        return

    ext = os.path.splitext(instance.file.name)[1].lower()
    if ext not in (".webp", ".gif"):
        return

    try:
        from PIL import Image as PILImage

        instance.file.open("rb")
        img = PILImage.open(instance.file)
        img = img.convert("RGBA")

        buf = io.BytesIO()
        img.save(buf, format="PNG")
        buf.seek(0)

        # Build the new storage path: replace extension with .png
        old_path = instance.file.name
        new_path = os.path.splitext(old_path)[0] + ".png"

        # Delete old file from storage
        instance.file.storage.delete(old_path)

        # Save new PNG file
        instance.file.save(new_path, ContentFile(buf.read()), save=False)
        instance.mime_type = "image/png"

        # Update original filename extension too
        if instance.original_filename:
            base = os.path.splitext(instance.original_filename)[0]
            instance.original_filename = base + ".png"

        # Use update() to avoid triggering signals again
        Asset.objects.filter(pk=instance.pk).update(
            file=instance.file.name,
            mime_type=instance.mime_type,
            original_filename=instance.original_filename,
        )

        import logging
        logger = logging.getLogger(__name__)
        logger.info(f"[Asset] Converted {ext} → PNG for asset {instance.pk}")

    except ImportError:
        import logging
        logging.getLogger(__name__).warning(
            "[Asset] Pillow not installed — cannot convert WebP/GIF to PNG. "
            "Install with: pip install Pillow"
        )
    except Exception as exc:
        import logging
        logging.getLogger(__name__).error(
            f"[Asset] Failed to convert {ext} to PNG for asset {instance.pk}: {exc}"
        )
