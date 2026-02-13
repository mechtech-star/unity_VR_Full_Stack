from django.core.management.base import BaseCommand
from django.conf import settings
from django.utils.text import slugify
import os


class Command(BaseCommand):
    help = "Detect and remove orphaned UI JSON files under MEDIA_ROOT/published_modules."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Don't delete anything; just report candidates for removal.",
        )

    def handle(self, *args, **options):
        dry_run = options.get("dry_run", False)
        out_dir = os.path.join(settings.MEDIA_ROOT, "published_modules")
        if not os.path.isdir(out_dir):
            self.stdout.write(f"No published_modules directory found at {out_dir}")
            return

        # Build set of filenames referenced by all PublishedModule payloads
        referenced = set()
        try:
            from authoring.models import PublishedModule
            pubs = PublishedModule.objects.select_related("module").all()
            for p in pubs:
                payload = getattr(p, "payload", {}) or {}
                for step in payload.get("steps", []):
                    ui_url = step.get("uiUrl")
                    if ui_url:
                        referenced.add(os.path.basename(ui_url))

                # Also include the module-level filename used by the publish service
                # Pattern: <slug>-<module.id>.json
                try:
                    module_obj = getattr(p, "module", None)
                    if module_obj and getattr(module_obj, "title", None):
                        slug = slugify(module_obj.title) or "module"
                    else:
                        slug = slugify(payload.get("title", "module")) or "module"
                    module_id = payload.get("moduleId") or (getattr(module_obj, "id", None) and str(module_obj.id))
                    if module_id:
                        referenced.add(f"{slug}-{module_id}.json")
                except Exception:
                    # best-effort; ignore failures here
                    pass
        except Exception as e:
            self.stderr.write(f"Error enumerating PublishedModule payloads: {e}")

        # Walk files in out_dir and delete those not referenced
        candidates = []
        for fname in os.listdir(out_dir):
            if fname in referenced:
                continue
            # Keep module-level files (endswith .json but not '-step-') only if referenced; otherwise consider removal
            # We consider any file not in referenced as candidate for deletion
            candidates.append(fname)

        if not candidates:
            self.stdout.write("No orphaned UI files found.")
            return

        self.stdout.write(f"Found {len(candidates)} orphaned UI files:")
        for c in candidates:
            self.stdout.write(f"  {c}")

        if dry_run:
            self.stdout.write("Dry run: no files were deleted.")
            return

        deleted = 0
        for c in candidates:
            try:
                os.remove(os.path.join(out_dir, c))
                deleted += 1
            except Exception as e:
                self.stderr.write(f"Failed to remove {c}: {e}")

        self.stdout.write(f"Deleted {deleted} files from {out_dir}.")
