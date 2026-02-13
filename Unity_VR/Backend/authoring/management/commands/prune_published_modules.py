from django.core.management.base import BaseCommand
from django.conf import settings


class Command(BaseCommand):
    help = "Prune older PublishedModule records, keeping only the most recent N per module."

    def add_arguments(self, parser):
        parser.add_argument(
            "--keep-latest",
            type=int,
            default=getattr(settings, "PUBLISHED_MODULE_RETENTION", {}).get("keep_latest", 3),
            help="Number of most recent versions to keep per module.",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Don't delete anything; just report what would be removed.",
        )

    def handle(self, *args, **options):
        keep_latest = int(options.get("keep_latest", 3))
        dry_run = options.get("dry_run", False)

        try:
            from authoring.services.prune_service import prune_published_modules
        except Exception as e:
            self.stderr.write(f"Unable to import prune service: {e}")
            return

        deleted = prune_published_modules(keep_latest=keep_latest, dry_run=dry_run)
        if dry_run:
            self.stdout.write("Dry run completed. No rows were deleted.")
        else:
            self.stdout.write(f"Pruning completed. Deleted {deleted} PublishedModule rows.")
