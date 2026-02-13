"""
Asset CRUD views. Simplified for Unity architecture — no more StepAsset join table.
Assets are referenced directly via ForeignKey on Step (media_asset, model_asset).
"""
from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser

from authoring.models import Asset
from authoring.serializers.asset_serializers import AssetUploadSerializer


class AssetUploadView(generics.CreateAPIView):
    """Accept multipart form uploads for assets."""
    queryset = Asset.objects.all()
    serializer_class = AssetUploadSerializer
    parser_classes = [MultiPartParser, FormParser]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        return super().create(request, *args, **kwargs)


class AssetListView(generics.ListAPIView):
    """List uploaded assets for the CMS asset manager."""
    queryset = Asset.objects.all().order_by("-created_at")
    serializer_class = AssetUploadSerializer


class AssetDeleteView(generics.DestroyAPIView):
    """Delete an uploaded Asset by UUID."""
    queryset = Asset.objects.all()
    lookup_field = "pk"
