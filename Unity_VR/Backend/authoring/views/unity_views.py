"""
Unity API views — read-only endpoints that produce the exact JSON
structure expected by the Unity XR runtime.

GET /api/unity/modules/           → Module catalog
GET /api/unity/modules/{module_id}/  → Full module training JSON
"""
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework import status

from authoring.models import Module
from authoring.serializers.unity_serializers import (
    UnityModuleCatalogSerializer,
    UnityModuleDetailSerializer,
)


class UnityModuleCatalogView(APIView):
    """Returns the module catalog JSON consumed by HomePageController."""

    def get(self, request):
        modules = Module.objects.filter(status="published").prefetch_related(
            "tasks__steps", "thumbnail"
        )
        serializer = UnityModuleCatalogSerializer()
        data = serializer.to_representation(modules)
        return Response(data)


class UnityModuleDetailView(APIView):
    """Returns the full training module JSON consumed by TrainingDataLoader."""

    def get(self, request, module_id):
        try:
            module = Module.objects.prefetch_related(
                "tasks__steps__choices__go_to_step",
                "tasks__steps__model_asset",
                "tasks__steps__media_asset",
            ).get(module_id=module_id)
        except Module.DoesNotExist:
            return Response(
                {"detail": f"Module '{module_id}' not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = UnityModuleDetailSerializer()
        data = serializer.to_representation(module)
        return Response(data)
