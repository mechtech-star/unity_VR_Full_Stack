import uuid
from django.db import models
from .module import Module
from .task import Task
from .asset import Asset


INSTRUCTION_TYPE_CHOICES = (
    ("info", "Info"),
    ("safety", "Safety"),
    ("observe", "Observe"),
    ("action", "Action"),
    ("inspect", "Inspect"),
    ("completion", "Completion"),
    ("question", "Question"),
)

MEDIA_TYPE_CHOICES = (
    ("image", "Image"),
    ("video", "Video"),
)

COMPLETION_TYPE_CHOICES = (
    ("button_clicked", "Button Clicked"),
    ("animation_completed", "Animation Completed"),
    ("interaction_completed", "Interaction Completed"),
    ("time_spent", "Time Spent"),
    ("user_confirmed", "User Confirmed"),
)

HAND_CHOICES = (
    ("left", "Left"),
    ("right", "Right"),
)


class Step(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    module = models.ForeignKey(Module, on_delete=models.CASCADE, related_name="steps")
    task = models.ForeignKey(Task, on_delete=models.CASCADE, related_name="steps", null=True, blank=True)
    order_index = models.PositiveIntegerField()
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True, default="")
    instruction_type = models.CharField(
        max_length=20, choices=INSTRUCTION_TYPE_CHOICES, default="info"
    )

    # ── Media (nullable) ──────────────────────────────────────────────
    media_type = models.CharField(
        max_length=10, choices=MEDIA_TYPE_CHOICES, null=True, blank=True
    )
    media_asset = models.ForeignKey(
        Asset, null=True, blank=True, on_delete=models.SET_NULL,
        related_name="media_for_steps"
    )

    # ── 3D Model (nullable) ──────────────────────────────────────────
    model_asset = models.ForeignKey(
        Asset, null=True, blank=True, on_delete=models.SET_NULL,
        related_name="model_for_steps"
    )
    model_animation = models.CharField(max_length=100, blank=True, default="")
    model_position_x = models.FloatField(default=0.0)
    model_position_y = models.FloatField(default=0.0)
    model_position_z = models.FloatField(default=2.0)
    model_rotation_x = models.FloatField(default=0.0)
    model_rotation_y = models.FloatField(default=180.0)
    model_rotation_z = models.FloatField(default=0.0)
    model_scale = models.FloatField(default=1.0)

    # ── Interaction (nullable) ────────────────────────────────────────
    interaction_required_action = models.CharField(max_length=100, blank=True, default="")
    interaction_input_method = models.CharField(max_length=50, blank=True, default="")
    interaction_target = models.CharField(max_length=200, blank=True, default="")
    interaction_hand = models.CharField(
        max_length=10, choices=HAND_CHOICES, blank=True, default=""
    )
    interaction_attempts_allowed = models.IntegerField(default=0)

    # ── Completion Criteria (nullable) ────────────────────────────────
    completion_type = models.CharField(
        max_length=30, choices=COMPLETION_TYPE_CHOICES, blank=True, default=""
    )
    completion_value = models.CharField(max_length=200, blank=True, default="")

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["order_index"]
        unique_together = ("task", "order_index")

    def __str__(self) -> str:
        return f"Step({self.title})"
