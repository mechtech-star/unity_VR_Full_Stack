import uuid
from django.db import models


class StepChoice(models.Model):
    """
    Branching choice for 'question' type steps.
    Each choice has a label and points to another step (goToStepId in Unity JSON).
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    step = models.ForeignKey(
        "authoring.Step", on_delete=models.CASCADE, related_name="choices"
    )
    label = models.CharField(max_length=200)
    go_to_step = models.ForeignKey(
        "authoring.Step", on_delete=models.SET_NULL,
        null=True, blank=True, related_name="choice_targets",
        help_text="The step to jump to when this choice is selected."
    )
    order_index = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["order_index"]

    def __str__(self) -> str:
        return f"Choice({self.label} -> {self.go_to_step_id})"
