"""
CMS-facing views for Module and Step CRUD.
"""
from django.db import models, transaction
from django.shortcuts import get_object_or_404
from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.views import APIView
from django.db.models import F
import re

from authoring.models import Module, Step, Task, StepChoice
from authoring.serializers.module_serializers import ModuleSerializer, StepSerializer


class ModuleCreateView(generics.ListCreateAPIView):
    queryset = Module.objects.prefetch_related("tasks__steps__choices").all()
    serializer_class = ModuleSerializer


class ModuleDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Module.objects.prefetch_related("tasks__steps__choices").all()
    serializer_class = ModuleSerializer


class ModulePublishView(APIView):
    """Toggle module status to 'published' so it appears in Unity catalog."""

    def post(self, request, module_id):
        module = get_object_or_404(Module, pk=module_id)
        if module.tasks.count() == 0:
            return Response(
                {"detail": "Module must have at least one task before publishing."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        module.status = "published"
        module.save(update_fields=["status", "updated_at"])
        return Response(
            {"id": str(module.id), "module_id": module.module_id, "status": "published"},
            status=status.HTTP_200_OK,
        )


class StepCreateView(generics.CreateAPIView):
    serializer_class = StepSerializer

    def perform_create(self, serializer):
        module = get_object_or_404(Module, pk=self.kwargs["module_id"])
        task_id = self.request.data.get("task")
        task = get_object_or_404(Task, pk=task_id, module=module)

        insert_after = self.request.data.get("insert_after_order")
        auto_re = re.compile(r"^\s*Step\s+(\d+)\.(\d+)\s*$", re.IGNORECASE)

        with transaction.atomic():
            if insert_after is not None:
                insert_after = int(insert_after)
                new_order = insert_after + 1
                # Shift subsequent steps up by 1 (highest-first to avoid unique constraint violations)
                steps_to_shift = list(
                    task.steps.filter(order_index__gte=new_order).order_by("-order_index")
                )
                for step_obj in steps_to_shift:
                    new_idx = step_obj.order_index + 1
                    updates = {"order_index": new_idx}
                    title_str = (step_obj.title or "").strip()
                    m = auto_re.match(title_str)
                    if m:
                        updates["title"] = f"Step {task.order_index}.{new_idx}"
                    Step.objects.filter(pk=step_obj.pk).update(**updates)
            else:
                last_index = (
                    task.steps.aggregate(max_idx=models.Max("order_index")).get("max_idx") or 0
                )
                new_order = last_index + 1

            # Auto-generate title based on task and step order indices
            title = self.request.data.get("title", "").strip()
            if not title:
                title = f"Step {task.order_index}.{new_order}"
            serializer.save(module=module, task=task, order_index=new_order, title=title)


class StepUpdateDeleteView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Step.objects.prefetch_related("choices").all()
    serializer_class = StepSerializer

    def perform_destroy(self, instance: Step):
        task = instance.task
        current_index = instance.order_index

        with transaction.atomic():
            # If step has no task, just delete it
            if task is None:
                instance.delete()
                return
                
            # Get steps to update
            steps_to_update = list(
                Step.objects.filter(task=task, order_index__gt=current_index)
                .order_by('order_index')
                .values('pk', 'order_index', 'title')
            )
            
            instance.delete()
            
            # Update each step's order_index individually
            for step_data in steps_to_update:
                new_index = step_data['order_index'] - 1
                Step.objects.filter(pk=step_data['pk']).update(order_index=new_index)
            
            # Update auto-generated titles like "Step 1.2"
            auto_re = re.compile(r"^\s*Step\s+(\d+)\.(\d+)\s*$", re.IGNORECASE)
            for step_data in steps_to_update:
                title = (step_data.get("title") or "").strip()
                m = auto_re.match(title)
                if m:
                    task_num = int(m.group(1))
                    step_num = int(m.group(2))
                    new_title = f"Step {task_num}.{step_num - 1}"
                    Step.objects.filter(pk=step_data["pk"]).update(title=new_title)


class StepDuplicateView(APIView):
    """Duplicate an existing step, inserting the copy right after the original."""

    def post(self, request, pk):
        original = get_object_or_404(Step.objects.prefetch_related("choices"), pk=pk)
        task = original.task
        module = original.module

        if not task:
            return Response(
                {"detail": "Cannot duplicate a step without a task."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            insert_after = original.order_index
            new_order = insert_after + 1

            # Shift subsequent steps up (highest-first to avoid unique constraint)
            steps_to_shift = list(
                task.steps.filter(order_index__gte=new_order).order_by("-order_index")
            )
            for step_obj in steps_to_shift:
                Step.objects.filter(pk=step_obj.pk).update(
                    order_index=step_obj.order_index + 1
                )

            # Create the duplicate
            new_step = Step.objects.create(
                module=module,
                task=task,
                order_index=new_order,
                title=f"{original.title} (copy)",
                description=original.description,
                instruction_type=original.instruction_type,
                media_type=original.media_type,
                media_asset=original.media_asset,
                model_asset=original.model_asset,
                model_animation=original.model_animation,
                model_animation_loop=original.model_animation_loop,
                model_position_x=original.model_position_x,
                model_position_y=original.model_position_y,
                model_position_z=original.model_position_z,
                model_rotation_x=original.model_rotation_x,
                model_rotation_y=original.model_rotation_y,
                model_rotation_z=original.model_rotation_z,
                model_scale=original.model_scale,
                models_data=original.models_data or [],
                interaction_required_action=original.interaction_required_action,
                interaction_input_method=original.interaction_input_method,
                interaction_target=original.interaction_target,
                interaction_hand=original.interaction_hand,
                interaction_attempts_allowed=original.interaction_attempts_allowed,
                completion_type=original.completion_type,
                completion_value=original.completion_value,
            )

            # Duplicate choices
            for choice in original.choices.all():
                StepChoice.objects.create(
                    step=new_step,
                    label=choice.label,
                    go_to_step=choice.go_to_step,
                    order_index=choice.order_index,
                )

        serializer = StepSerializer(new_step)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class StepReorderView(APIView):
    def post(self, request, module_id):
        module = get_object_or_404(Module, pk=module_id)
        ordered_ids = request.data.get("orderedStepIds", [])
        step_ids = [str(s.id) for s in module.steps.all()]
        if len(ordered_ids) != len(step_ids) or set(ordered_ids) != set(step_ids):
            return Response(
                {"detail": "orderedStepIds must match module steps"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        auto_re = re.compile(r"^\s*Step\s+(\d+)\.(\d+)\s*$", re.IGNORECASE)

        with transaction.atomic():
            # Build a mapping of step_id -> task for title updates
            steps_qs = Step.objects.filter(module=module).select_related("task")
            step_map = {str(s.id): s for s in steps_qs}

            for idx, step_id in enumerate(ordered_ids):
                new_order = idx + 1
                step_obj = step_map.get(str(step_id))
                updates = {"order_index": new_order}

                # Update auto-generated titles to reflect new position
                if step_obj and step_obj.task:
                    title = (step_obj.title or "").strip()
                    m = auto_re.match(title)
                    if m:
                        updates["title"] = f"Step {step_obj.task.order_index}.{new_order}"

                Step.objects.filter(pk=step_id, module=module).update(**updates)

        return Response({"detail": "reordered"}, status=status.HTTP_200_OK)
