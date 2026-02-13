from rest_framework import serializers
from authoring.models import Asset


class AssetUploadSerializer(serializers.ModelSerializer):
    class Meta:
        model = Asset
        fields = ["id", "file", "original_filename", "type", "mime_type", "size_bytes", "metadata", "created_at"]
        # Fields populated by the serializer's validate() should be read-only
        read_only_fields = ["id", "created_at", "original_filename", "mime_type", "size_bytes"]

    def validate(self, attrs):
        file_obj = attrs.get("file")
        if not file_obj:
            raise serializers.ValidationError("File is required")
        asset_type = attrs.get("type")
        if not asset_type:
            raise serializers.ValidationError({"type": "type is required"})
        ext = (file_obj.name or "").lower().rsplit(".", 1)
        ext = f".{ext[-1]}" if len(ext) > 1 else ""
        from django.conf import settings

        type_allowed = getattr(settings, "ALLOWED_ASSET_EXTENSIONS", {}).get(asset_type)
        if type_allowed and ext not in type_allowed:
            raise serializers.ValidationError({"file": f"Extension {ext} not allowed for type {asset_type}"})
        attrs["size_bytes"] = file_obj.size
        attrs["mime_type"] = getattr(file_obj, "content_type", None) or "application/octet-stream"
        attrs["original_filename"] = file_obj.name

        # If metadata was provided as a JSON string (multipart/form-data), parse it.
        metadata = attrs.get("metadata")
        if metadata and isinstance(metadata, str):
            try:
                import json
                attrs["metadata"] = json.loads(metadata)
            except Exception:
                raise serializers.ValidationError({"metadata": "Invalid JSON"})

        return attrs

    def to_representation(self, instance):
        rep = super().to_representation(instance)
        rep.pop("file", None)
        rep["url"] = instance.file.url if instance.file else None
        rep["sizeBytes"] = rep.pop("size_bytes")
        rep["mimeType"] = rep.pop("mime_type")
        rep["originalFilename"] = rep.pop("original_filename")
        return rep
