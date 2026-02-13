from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from authoring.models import Task, Step, Module
from authoring.serializers.task_serializers import (
    TaskListSerializer,
    TaskDetailSerializer,
    TaskCreateUpdateSerializer,
)
from authoring.serializers.module_serializers import StepSerializer
from django.db import transaction
from django.db.models import F
import re


class TaskViewSet(viewsets.ModelViewSet):
    queryset = Task.objects.all()
    
    def get_serializer_class(self):
        if self.action == 'list':
            return TaskListSerializer
        elif self.action in ['create', 'update', 'partial_update']:
            return TaskCreateUpdateSerializer
        return TaskDetailSerializer
    
    def get_queryset(self):
        queryset = Task.objects.all()
        module_id = self.request.query_params.get('module_id')
        if module_id:
            queryset = queryset.filter(module_id=module_id)
        return queryset.prefetch_related('steps')
    
    def perform_destroy(self, instance: Task):
        """
        Delete a task and renormalize ordering of subsequent tasks.
        Auto-generated step titles (Task.Step format) are updated to reflect new task indices.
        """
        module = instance.module
        current_task_index = instance.order_index
        
        with transaction.atomic():
            # Get affected tasks (those after the deleted one)
            affected_tasks = list(
                Task.objects.filter(module=module, order_index__gt=current_task_index).values("pk", "order_index").prefetch_related("steps")
            )
            
            # Delete the task (cascade will delete its steps)
            instance.delete()
            
            # Decrement order_index for subsequent tasks
            Task.objects.filter(module=module, order_index__gt=current_task_index).update(
                order_index=F("order_index") - 1
            )
            
            # Update auto-generated step titles in affected tasks to reflect new task indices
            # Step titles like "Step 3.1" should become "Step 2.1" when task 3 becomes task 2
            auto_re = re.compile(r"^\s*Step\s+(\d+)\.(\d+)\s*$", re.IGNORECASE)
            
            for task_data in affected_tasks:
                task_id = task_data["pk"]
                old_task_idx = task_data["order_index"]
                new_task_idx = old_task_idx - 1
                
                # Update all steps in this task with new task index
                steps = Step.objects.filter(task_id=task_id)
                for step in steps:
                    title = (step.title or "").strip()
                    m = auto_re.match(title)
                    if m:
                        old_task_num = int(m.group(1))
                        step_num = int(m.group(2))
                        # Only update if the title matches this task's old index
                        if old_task_num == old_task_idx:
                            new_title = f"Step {new_task_idx}.{step_num}"
                            Step.objects.filter(pk=step.pk).update(title=new_title)
    
    @action(detail=True, methods=['post'])
    def add_step(self, request, pk=None):
        """Add a new step to this task"""
        task = self.get_object()
        serializer = StepSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(task=task, module=task.module)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    @action(detail=True, methods=['get'])
    def steps(self, request, pk=None):
        """Get all steps for this task"""
        task = self.get_object()
        steps = task.steps.all()
        serializer = StepSerializer(steps, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['post'])
    def reorder(self, request):
        """Reorder tasks within a module"""
        task_ids = request.data.get('task_ids', [])
        if not task_ids:
            return Response({'error': 'task_ids required'}, status=status.HTTP_400_BAD_REQUEST)
        
        for index, task_id in enumerate(task_ids):
            Task.objects.filter(pk=task_id).update(order_index=index + 1)
        
        return Response({'status': 'success'})
