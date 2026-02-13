"""
One-time management command to fix auto-generated step titles
so they match the actual task.order_index and step.order_index.

Usage:
    python manage.py fix_step_titles          # dry-run (prints changes)
    python manage.py fix_step_titles --apply  # apply changes
"""
import re
from django.core.management.base import BaseCommand
from authoring.models import Step

AUTO_TITLE_RE = re.compile(r"^\s*Step\s+(\d+)\.(\d+)\s*$", re.IGNORECASE)


class Command(BaseCommand):
    help = "Fix auto-generated step titles (Step X.Y) to match actual order indices."

    def add_arguments(self, parser):
        parser.add_argument(
            "--apply",
            action="store_true",
            default=False,
            help="Actually apply the changes (default is dry-run).",
        )

    def handle(self, *args, **options):
        apply = options["apply"]
        fixed = 0

        steps = Step.objects.select_related("task").order_by(
            "task__module_id", "task__order_index", "order_index"
        )

        for step in steps:
            title = (step.title or "").strip()
            m = AUTO_TITLE_RE.match(title)
            if not m:
                continue  # user-edited title, skip

            task = step.task
            if not task:
                continue

            expected_title = f"Step {task.order_index}.{step.order_index}"
            if title == expected_title:
                continue  # already correct

            self.stdout.write(
                f"  {step.pk}: \"{title}\" -> \"{expected_title}\""
            )

            if apply:
                Step.objects.filter(pk=step.pk).update(title=expected_title)
            fixed += 1

        mode = "Fixed" if apply else "Would fix"
        self.stdout.write(self.style.SUCCESS(f"\n{mode} {fixed} step title(s)."))
        if not apply and fixed > 0:
            self.stdout.write("Run with --apply to commit changes.")
