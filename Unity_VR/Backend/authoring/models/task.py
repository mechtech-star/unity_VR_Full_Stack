import uuid
from django.db import models
from .module import Module


class Task(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    module = models.ForeignKey(Module, on_delete=models.CASCADE, related_name="tasks")
    order_index = models.PositiveIntegerField()
    title = models.CharField(max_length=200)
    description = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["order_index"]
        unique_together = ("module", "order_index")

    def __str__(self) -> str:  # pragma: no cover
        return f"Task({self.title})"
