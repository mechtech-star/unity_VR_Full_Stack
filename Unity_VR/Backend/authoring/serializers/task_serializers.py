from rest_framework import serializers
from authoring.models import Task, Step
from authoring.serializers.module_serializers import StepSerializer


class TaskListSerializer(serializers.ModelSerializer):
    """Serializer for listing tasks (without nested steps)"""
    class Meta:
        model = Task
        fields = [
            "id", "module", "order_index", "title",
            "description", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class TaskDetailSerializer(serializers.ModelSerializer):
    """Serializer for task detail with nested steps"""
    steps = StepSerializer(many=True, read_only=True)

    class Meta:
        model = Task
        fields = [
            "id", "module", "order_index", "title",
            "description", "steps", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class TaskCreateUpdateSerializer(serializers.ModelSerializer):
    """Serializer for creating/updating tasks"""
    class Meta:
        model = Task
        fields = ["id", "module", "order_index", "title", "description"]
        read_only_fields = ["id"]
