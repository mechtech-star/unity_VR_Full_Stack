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

from authoring.models import Module, Step, Task
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
            affected = list(
                Step.objects.filter(task=task, order_index__gt=current_index)
                .values("pk", "order_index", "title")
            )
            instance.delete()
            Step.objects.filter(task=task, order_index__gt=current_index).update(
                order_index=F("order_index") - 1
            )

            # Update auto-generated titles like "Step 1.2"
            auto_re = re.compile(r"^\s*Step\s+(\d+(?:\.\d+)?)\s*$", re.IGNORECASE)
            for row in affected:
                title = (row.get("title") or "").strip()
                m = auto_re.match(title)
                if not m:
                    continue
                old_part = m.group(1)
                if "." in old_part:
                    parts = old_part.split(".")
                    new_title = f"Step {parts[0]}.{int(parts[1]) - 1}"
                else:
                    new_title = f"Step {int(old_part) - 1}"
                Step.objects.filter(pk=row["pk"]).update(title=new_title)


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
