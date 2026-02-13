import uuid
from django.db import models
from .module import Module


class PublishedModule(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    module = models.ForeignKey(Module, on_delete=models.CASCADE, related_name="published_versions")
    version = models.PositiveIntegerField()
    schema_version = models.PositiveIntegerField(default=1)
    payload = models.JSONField()
    published_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-published_at"]
        unique_together = ("module", "version")

    def __str__(self) -> str:  # pragma: no cover
        return f"PublishedModule({self.module_id}, v{self.version})"
