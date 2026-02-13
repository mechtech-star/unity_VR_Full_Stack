from django.urls import path
from rest_framework.routers import DefaultRouter

from authoring.views.module_views import (
    ModuleCreateView,
    ModuleDetailView,
    StepCreateView,
    StepUpdateDeleteView,
    StepReorderView,
    ModulePublishView,
)
from authoring.views.asset_views import (
    AssetUploadView,
    AssetListView,
    AssetDeleteView,
)
from authoring.views.task_views import TaskViewSet
from authoring.views.unity_views import (
    UnityModuleCatalogView,
    UnityModuleDetailView,
)

# Task viewset routes
router = DefaultRouter()
router.register(r"tasks", TaskViewSet, basename="task")

urlpatterns = [
    # ── CMS Authoring Endpoints ───────────────────────────────────────
    path("modules", ModuleCreateView.as_view(), name="module-create"),
    path("modules/<uuid:pk>", ModuleDetailView.as_view(), name="module-detail"),
    path("modules/<uuid:module_id>/steps", StepCreateView.as_view(), name="step-create"),
    path("modules/<uuid:module_id>/steps/reorder", StepReorderView.as_view(), name="step-reorder"),
    path("modules/<uuid:module_id>/publish", ModulePublishView.as_view(), name="module-publish"),
    path("steps/<uuid:pk>", StepUpdateDeleteView.as_view(), name="step-detail"),

    # ── Asset Management ──────────────────────────────────────────────
    path("assets/upload", AssetUploadView.as_view(), name="asset-upload"),
    path("assets", AssetListView.as_view(), name="asset-list"),
    path("assets/<uuid:pk>", AssetDeleteView.as_view(), name="asset-delete"),

    # ── Unity Runtime API ─────────────────────────────────────────────
    path("unity/modules/", UnityModuleCatalogView.as_view(), name="unity-catalog"),
    path("unity/modules/<str:module_id>/", UnityModuleDetailView.as_view(), name="unity-module-detail"),
] + router.urls
