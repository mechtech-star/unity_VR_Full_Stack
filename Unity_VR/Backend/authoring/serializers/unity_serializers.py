"""
Unity-specific serializers that produce JSON matching the Unity runtime contract.
These are read-only serializers used by the Unity API endpoints.
"""
from rest_framework import serializers
from authoring.models import Module, Task, Step, StepChoice, Asset


class UnityModuleCatalogSerializer(serializers.Serializer):
    """
    Serializes a list of modules into the Unity module_catalog.json format.
    """

    def to_representation(self, instance):
        catalog = []
        for module in instance:
            tasks = module.tasks.all()
            task_count = tasks.count()
            step_count = sum(t.steps.count() for t in tasks)
            thumbnail_url = ""
            if module.thumbnail and module.thumbnail.file:
                thumbnail_url = module.thumbnail.file.url

            catalog.append({
                "moduleId": module.module_id,
                "title": module.title,
                "description": module.description or "",
                "version": module.version,
                "mode": module.mode,
                "estimatedDurationMin": module.estimated_duration_min,
                "language": module.language,
                "taskCount": task_count,
                "stepCount": step_count,
                "icon": module.icon or "",
                "jsonPath": f"/api/unity/modules/{module.module_id}/",
                "thumbnail": thumbnail_url,
                "tags": module.tags or [],
            })
        return {"modules": catalog}


class UnityModuleDetailSerializer(serializers.Serializer):
    """
    Serializes a single module into the Unity training JSON format.
    Produces the exact structure consumed by TrainingModuleData in Unity.
    """

    def to_representation(self, instance):
        tasks = list(
            instance.tasks.order_by("order_index")
            .prefetch_related(
                "steps__choices__go_to_step",
                "steps__model_asset",
                "steps__media_asset",
            )
        )

        # Build global step ID map (stepId is sequential across ALL tasks)
        global_step_id = 0
        step_id_map = {}  # step.pk -> global integer id
        ordered_steps_by_task = {}

        for task in tasks:
            steps = list(task.steps.order_by("order_index"))
            ordered_steps_by_task[task.pk] = steps
            for step in steps:
                global_step_id += 1
                step_id_map[step.pk] = global_step_id

        # Serialize tasks
        tasks_data = []
        for task in tasks:
            steps_data = []
            for step in ordered_steps_by_task[task.pk]:
                step_data = {
                    "stepId": step_id_map[step.pk],
                    "title": step.title,
                    "description": step.description or "",
                    "instructionType": step.instruction_type,
                    "media": self._serialize_media(step),
                    "models": self._serialize_models(step),
                    "interactions": self._serialize_interactions(step),
                    "completionCriteria": self._serialize_completion(step),
                }

                # Only add choices for question-type steps
                if step.instruction_type == "question":
                    step_data["choices"] = self._serialize_choices(
                        step, step_id_map
                    )
                else:
                    # Include choices as null when not a question
                    choices = list(step.choices.order_by("order_index"))
                    if choices:
                        step_data["choices"] = self._serialize_choices(
                            step, step_id_map
                        )

                steps_data.append(step_data)

            tasks_data.append(
                {
                    "taskId": task.order_index,
                    "taskTitle": f"Task {task.order_index}: {task.title}",
                    "steps": steps_data,
                }
            )

        return {
            "moduleId": instance.module_id,
            "title": instance.title,
            "version": instance.version,
            "mode": instance.mode,
            "estimatedDurationMin": instance.estimated_duration_min,
            "language": instance.language,
            "tasks": tasks_data,
        }

    def _serialize_media(self, step):
        if not step.media_asset:
            return None
        return {
            "type": step.media_type or "image",
            "path": step.media_asset.file.url if step.media_asset.file else "",
        }

    def _serialize_models(self, step):
        """Always returns a list of model objects (possibly empty)."""
        result = []
        models = getattr(step, 'models_data', [])
        if models:
            for model in models:
                if not model.get("asset"):
                    continue
                try:
                    asset = Asset.objects.get(id=model["asset"])
                    result.append({
                        "path": asset.file.url if asset.file else "",
                        "animation": model.get("animation", ""),
                        "animationLoop": model.get("animation_loop", False),
                        "spawn": {
                            "position": [
                                model.get("position_x", 0),
                                model.get("position_y", 0),
                                model.get("position_z", 0),
                            ],
                            "rotation": [
                                model.get("rotation_x", 0),
                                model.get("rotation_y", 0),
                                model.get("rotation_z", 0),
                            ],
                            "scale": model.get("scale", 1),
                        },
                    })
                except Asset.DoesNotExist:
                    continue
        elif step.model_asset:
            # Fallback to legacy single model for backward compatibility
            result.append({
                "path": step.model_asset.file.url if step.model_asset.file else "",
                "animation": step.model_animation or "",
                "animationLoop": step.model_animation_loop,
                "spawn": {
                    "position": [
                        step.model_position_x,
                        step.model_position_y,
                        step.model_position_z,
                    ],
                    "rotation": [
                        step.model_rotation_x,
                        step.model_rotation_y,
                        step.model_rotation_z,
                    ],
                    "scale": step.model_scale,
                },
            })
        return result

    def _serialize_interactions(self, step):
        if not step.interaction_required_action:
            return None
        return {
            "requiredAction": step.interaction_required_action,
            "inputMethod": step.interaction_input_method or None,
            "target": step.interaction_target or None,
            "hand": step.interaction_hand or None,
            "attemptsAllowed": step.interaction_attempts_allowed,
        }

    def _serialize_completion(self, step):
        if not step.completion_type:
            return None
        return {
            "type": step.completion_type,
            "value": step.completion_value or "",
        }

    def _serialize_choices(self, step, step_id_map):
        choices = list(step.choices.order_by("order_index"))
        if not choices:
            return None
        return [
            {
                "label": choice.label,
                "goToStepId": step_id_map.get(choice.go_to_step_id, 0),
            }
            for choice in choices
        ]
