# Authoring Backend (Django + DRF + Postgres)

Backend for live authoring and publish pipeline. Built with Django 5 + DRF, PostgreSQL, local filesystem asset storage.

## Quick start (dev)

1. Create and activate a virtualenv (Python 3.11+ recommended).
2. Install deps: `pip install -r requirements.txt`
3. Copy env: `cp .env.example .env` and set values (Postgres, secret key).
4. Apply migrations: `python manage.py migrate`
5. Run server: `python manage.py runserver 0.0.0.0:8000`

## Environment

- `DJANGO_SECRET_KEY` – required for non-dev
- `DJANGO_DEBUG` – `1` for dev
- `DJANGO_ALLOWED_HOSTS` – comma list
- `POSTGRES_*` – database settings
- `ASSET_MAX_UPLOAD_BYTES` – max upload size in bytes (default 100MB)

## Storage

- Media root: `media/`
- Asset layout: `/media/assets/{asset_type}/{uuid}/original.{ext}`
- Served via `/media/` in DEBUG; frontends should use returned URLs.

## API (high level)

- Modules: `POST /api/modules`, `GET|PUT|DELETE /api/modules/{id}`
- Steps: `POST /api/modules/{moduleId}/steps`, `PUT|DELETE /api/steps/{stepId}`, `POST /api/modules/{moduleId}/steps/reorder`
- Assets: `POST /api/assets/upload`
- Step assets: `POST /api/steps/{stepId}/assets`, `DELETE /api/step-assets/{id}`
- Publish: `POST /api/modules/{moduleId}/publish`, runtime: `GET /api/modules/{moduleId}/runtime`

## Notes

- UUID primary keys for all models.
- Publishing is immutable; versions increment per publish.
- Reordering is atomic per module.
- Basic validation on asset size/extension and per-type extension checks.
- CORS is open in dev (`CORS_ALLOW_ALL_ORIGINS=True`); tighten for prod.
