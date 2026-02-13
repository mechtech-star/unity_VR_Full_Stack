import uuid
from django.db import models
from .asset import Asset
from .step import Step


class StepAsset(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    step = models.ForeignKey(Step, on_delete=models.CASCADE, related_name="step_assets")
    asset = models.ForeignKey(Asset, on_delete=models.CASCADE, related_name="asset_steps")
    priority = models.IntegerField(default=0)
    metadata = models.JSONField(null=True, blank=True)

    class Meta:
        ordering = ["priority", "id"]
        unique_together = ("step", "asset")

    def __str__(self) -> str:  # pragma: no cover
        return f"StepAsset(step={self.step_id}, asset={self.asset_id})"
