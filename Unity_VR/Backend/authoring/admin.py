from django.contrib import admin
from .models import Asset, Module, Task, Step, StepChoice


@admin.register(Asset)
class AssetAdmin(admin.ModelAdmin):
    list_display = ("id", "original_filename", "type", "mime_type", "size_bytes", "created_at")
    search_fields = ("original_filename", "mime_type")


@admin.register(Module)
class ModuleAdmin(admin.ModelAdmin):
    list_display = ("id", "module_id", "title", "mode", "status", "version", "created_at")
    search_fields = ("title", "module_id")


@admin.register(Task)
class TaskAdmin(admin.ModelAdmin):
    list_display = ("id", "module", "order_index", "title", "created_at")
    list_filter = ("module",)


@admin.register(Step)
class StepAdmin(admin.ModelAdmin):
    list_display = ("id", "task", "order_index", "title", "instruction_type", "created_at")
    list_filter = ("module", "instruction_type")


@admin.register(StepChoice)
class StepChoiceAdmin(admin.ModelAdmin):
    list_display = ("id", "step", "label", "go_to_step", "order_index")
    list_filter = ("step",)
