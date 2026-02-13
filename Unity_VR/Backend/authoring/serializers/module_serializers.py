"""
CMS-facing serializers for Module and Step CRUD operations.
"""
from rest_framework import serializers
from authoring.models import Module, Step, StepChoice, Asset, Task


# ── Step Choice ───────────────────────────────────────────────────────
class StepChoiceSerializer(serializers.ModelSerializer):
    go_to_step = serializers.PrimaryKeyRelatedField(
        queryset=Step.objects.all(), allow_null=True, required=False
    )

    class Meta:
        model = StepChoice
        fields = ["id", "label", "go_to_step", "order_index"]
        read_only_fields = ["id"]


# ── Step ──────────────────────────────────────────────────────────────
class StepSerializer(serializers.ModelSerializer):
    choices = StepChoiceSerializer(many=True, required=False)
    title = serializers.CharField(allow_blank=True, required=False)
    description = serializers.CharField(allow_blank=True, required=False)
    task = serializers.PrimaryKeyRelatedField(
        queryset=Task.objects.all(), allow_null=True, required=False
    )
    media_asset = serializers.PrimaryKeyRelatedField(
        queryset=Asset.objects.all(), allow_null=True, required=False
    )
    model_asset = serializers.PrimaryKeyRelatedField(
        queryset=Asset.objects.all(), allow_null=True, required=False
    )

    class Meta:
        model = Step
        fields = [
            "id", "module", "task", "order_index",
            "title", "description", "instruction_type",
            # Media
            "media_type", "media_asset",
            # Models (multiple)
            "models_data",
            # Legacy single model fields (for backward compatibility)
            "model_asset", "model_animation", "model_animation_loop",
            "model_position_x", "model_position_y", "model_position_z",
            "model_rotation_x", "model_rotation_y", "model_rotation_z",
            "model_scale",
            # Interaction
            "interaction_required_action", "interaction_input_method",
            "interaction_target", "interaction_hand",
            "interaction_attempts_allowed",
            # Completion
            "completion_type", "completion_value",
            # Choices
            "choices",
            # Timestamps
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at", "module", "order_index"]

    def to_representation(self, instance):
        rep = super().to_representation(instance)
        # Include asset URLs for convenience
        if instance.media_asset and instance.media_asset.file:
            rep["media_asset_url"] = instance.media_asset.file.url
            rep["media_asset_filename"] = instance.media_asset.original_filename
        if instance.model_asset and instance.model_asset.file:
            rep["model_asset_url"] = instance.model_asset.file.url
            rep["model_asset_filename"] = instance.model_asset.original_filename
            rep["model_asset_metadata"] = instance.model_asset.metadata

        # Handle models array - if models_data field is empty but old fields exist, convert to array
        if not rep.get("models_data") and rep.get("model_asset"):
            rep["models"] = [{
                "asset": rep["model_asset"],
                "asset_url": rep.get("model_asset_url"),
                "asset_filename": rep.get("model_asset_filename"),
                "asset_metadata": rep.get("model_asset_metadata"),
                "animation": rep.get("model_animation", ""),
                "position_x": rep.get("model_position_x", 0),
                "position_y": rep.get("model_position_y", 0),
                "position_z": rep.get("model_position_z", 0),
                "rotation_x": rep.get("model_rotation_x", 0),
                "rotation_y": rep.get("model_rotation_y", 0),
                "rotation_z": rep.get("model_rotation_z", 0),
                "scale": rep.get("model_scale", 1),
                "animation_loop": rep.get("model_animation_loop", False),
            }]
        elif rep.get("models_data"):
            # Use models_data from database and add asset URLs
            rep["models"] = rep["models_data"]
            for model in rep["models"]:
                if model.get("asset"):
                    asset = Asset.objects.filter(id=model["asset"]).first()
                    if asset and asset.file:
                        model["asset_url"] = asset.file.url
                        model["asset_filename"] = asset.original_filename
                        model["asset_metadata"] = asset.metadata

        return rep

    def to_internal_value(self, data):
        # Handle models array conversion
        models = data.get("models", [])
        if models and len(models) > 0:
            # Store the models array
            data = data.copy()
            data["models_data"] = models

            # Also populate legacy fields with first model for backward compatibility
            first_model = models[0]
            data["model_asset"] = first_model.get("asset")
            data["model_animation"] = first_model.get("animation", "")
            data["model_position_x"] = first_model.get("position_x", 0)
            data["model_position_y"] = first_model.get("position_y", 0)
            data["model_position_z"] = first_model.get("position_z", 0)
            data["model_rotation_x"] = first_model.get("rotation_x", 0)
            data["model_rotation_y"] = first_model.get("rotation_y", 0)
            data["model_rotation_z"] = first_model.get("rotation_z", 0)
            data["model_scale"] = first_model.get("scale", 1)
            data["model_animation_loop"] = first_model.get("animation_loop", False)

        return super().to_internal_value(data)

    def update(self, instance, validated_data):
        choices_data = validated_data.pop("choices", None)
        instance = super().update(instance, validated_data)
        if choices_data is not None:
            self._sync_choices(instance, choices_data)
        return instance

    def _sync_choices(self, step, choices_data):
        """Replace all choices for this step."""
        step.choices.all().delete()
        for idx, choice_data in enumerate(choices_data):
            StepChoice.objects.create(
                step=step,
                label=choice_data.get("label", ""),
                go_to_step=choice_data.get("go_to_step"),
                order_index=idx,
            )


# ── Task with Steps ──────────────────────────────────────────────────
class TaskWithStepsSerializer(serializers.ModelSerializer):
    steps = StepSerializer(many=True, read_only=True)

    class Meta:
        model = Task
        fields = [
            "id", "order_index", "title", "description",
            "created_at", "updated_at", "steps",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


# ── Module ────────────────────────────────────────────────────────────
class ModuleSerializer(serializers.ModelSerializer):
    tasks = TaskWithStepsSerializer(many=True, read_only=True)
    thumbnail = serializers.PrimaryKeyRelatedField(
        queryset=Asset.objects.all(), allow_null=True, required=False
    )

    class Meta:
        model = Module
        fields = [
            "id", "module_id", "title", "description",
            "version", "mode", "estimated_duration_min",
            "language", "icon", "thumbnail", "tags",
            "status", "created_at", "updated_at",
            "tasks",
        ]
        read_only_fields = ["id", "module_id", "status", "created_at", "updated_at"]

    def to_representation(self, instance):
        rep = super().to_representation(instance)
        if instance.thumbnail and instance.thumbnail.file:
            rep["thumbnail_url"] = instance.thumbnail.file.url
        return rep
