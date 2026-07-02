---
name: json-import-validator
description: Use when implementing or modifying the admin product bulk-import flow. Triggers on /api/admin/products/import/*, the ImportJob model, JSON schema for product import, or the in-memory import_jobs dict at backend/app/routers/admin.py.
---

# JSON Import Validator Skill

## Overview
ModestWear admins bulk-load products via JSON. The current implementation in `backend/app/routers/admin.py` is functional but uses an **in-memory dict** (`import_jobs: dict[str, dict] = {}`) for job tracking — jobs are lost on restart and don't survive multi-worker deployments.

## When to use this skill
- Editing `backend/app/routers/admin.py` import endpoints
- Changing the import JSON schema (see `plan.md §8` and `backend/sample_products.json`)
- Adding new validation rules
- Replacing the in-memory job dict with a DB-backed model
- Building the admin import UI at `frontend/app/admin/import/`

## Current flow

```
1. Admin uploads JSON → POST /api/admin/products/import/preview
   ↓
2. Backend validates: required fields, slug uniqueness, category existence
   ↓
3. Returns: {total_products, categories_to_create, row_errors}
   ↓
4. Admin reviews, hits POST /api/admin/products/import/confirm {job_id}
   ↓
5. Backend creates Products + Variants transactionally
   ↓
6. Returns ImportJobStatus {job_id, status, imported_count, errors}
   ↓
7. Admin polls GET /api/admin/import/{job_id}
```

**The current code skips step 3 → 4 persistence.** `preview` validates but does NOT store the payload. `confirm` looks up `import_jobs` by ID, but no endpoint creates a job first. This is the critical bug to fix.

## Required fix: persist import jobs

Add to `backend/app/models/import_job.py`:

```python
from datetime import datetime
from sqlalchemy import String, Integer, DateTime, JSON
from sqlalchemy.orm import Mapped, mapped_column
from app.models.base import Base

class ImportJob(Base):
    __tablename__ = "import_jobs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)  # uuid4
    status: Mapped[str] = mapped_column(String(20), default="pending")  # pending|processing|completed|failed
    payload: Mapped[dict] = mapped_column(JSON)                      # original import_data
    total_products: Mapped[int] = mapped_column(Integer, default=0)
    imported_count: Mapped[int] = mapped_column(Integer, default=0)
    categories_created: Mapped[list] = mapped_column(JSON, default=list)
    row_errors: Mapped[list] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    admin_user_id: Mapped[int] = mapped_column(Integer)  # FK to users.id
```

Add an Alembic migration (use the `alembic-migration` skill).

## Revised flow with persistence

```python
@router.post("/products/import/preview", response_model=ImportJobStatus)
async def preview_import(import_data: ProductImportRequest, db, current_admin):
    row_errors = validate(import_data, db)
    categories_to_create = [...]

    job = ImportJob(
        id=str(uuid.uuid4()),
        status="pending",
        payload=import_data.model_dump(),
        total_products=len(import_data.products),
        row_errors=[e.model_dump() for e in row_errors],
        categories_created=[...],
        admin_user_id=current_admin.user_id,
    )
    db.add(job)
    await db.commit()

    return ImportJobStatus(
        job_id=job.id,
        status="pending",
        total_products=job.total_products,
        row_errors=row_errors,
        categories_to_create=categories_to_create,
    )

@router.post("/products/import/confirm", response_model=ImportJobStatus)
async def confirm_import(req: ImportConfirmRequest, db, current_admin):
    job = await db.get(ImportJob, req.job_id)
    if not job: raise HTTPException(404)
    if job.status != "pending": raise HTTPException(400, f"Job is {job.status}")

    job.status = "processing"
    await db.commit()

    try:
        imported, errors = await execute_import(db, ProductImportRequest(**job.payload))
        job.status = "completed" if not errors else "completed_with_errors"
        job.imported_count = imported
        job.row_errors.extend([{"phase": "import", "error": e} for e in errors])
    except Exception as e:
        await db.rollback()
        job.status = "failed"
        job.row_errors.append({"phase": "import", "error": str(e)})

    job.completed_at = datetime.utcnow()
    await db.commit()
    return ImportJobStatus.model_validate(job)
```

## Validation rules (canonical)

The current `preview` checks: name, description, variants non-empty, variant.size, variant.color, variant.price > 0, slug uniqueness, category existence. **Add these missing checks:**

| Field | Rule |
|---|---|
| `slug` format | `^[a-z0-9-]+$` |
| `slug` length | 1–120 chars |
| `price` | integer cents, 1 ≤ price ≤ 10_000_00 ($10,000) |
| `stock` | 0 ≤ stock ≤ 100_000 |
| `images` | each URL starts with `https://` or `/` (local path) |
| `sku` | `^[A-Z0-9-]{1,64}$` if provided |
| `tags` | each ≤ 32 chars, total ≤ 10 per product |
| `category` | ≤ 64 chars |
| `variants` | ≤ 50 per product (UI / UX limit) |

Move these into a `validate_product()` function in a new `app/services/import_validator.py`.

## Schema versioning

The current `ProductImportRequest` in `backend/app/schemas/admin.py` has no version field. Add:

```python
class ProductImportRequest(BaseModel):
    schema_version: int = 1
    products: list[ImportProduct]
```

On the backend, branch on `schema_version` to handle migrations. Persist the version on `ImportJob` so admin UI can show "stale import — please re-export."

## Dry-run diff (future enhancement)

Before `confirm`, show the admin which products are **new** vs which would **update existing** (by slug). Add `would_create: int` and `would_update: int` to the preview response.

## Idempotency

`confirm` should be safely re-runnable. Use slug as the natural key. If a product with the same slug already exists and the admin has not opted into "update existing," skip it and report. This is currently **not implemented**.

## Frontend integration

`frontend/app/admin/page.tsx` mocks the data. The real `/admin/import` page (not yet built) should:

1. Show a dropzone for `.json` upload
2. Call `/api/admin/products/import/preview`
3. Render a table: product name, slug, status (will-create / will-update / error), inline error messages
4. Confirm button → `POST /api/admin/products/import/confirm`
5. Poll `GET /api/admin/import/{job_id}` every 2s until status != pending/processing
6. Show summary: "Imported X of Y, N errors"

## Things to never do

- Never trust the client to send validated JSON. Always re-validate server-side.
- Never store the full payload in the in-memory dict (current bug). Always in DB.
- Never allow a `confirm` call to skip the preview step. Two-step is mandatory.
- Never run an import in a single huge transaction. Chunk by product; commit every 50.
- Never expose other admins' import jobs. Filter by `admin_user_id`.
