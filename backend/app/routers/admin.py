"""PLAN 4 admin endpoints.

Layout
------
- /api/admin/dashboard   : KPIs + low stock + recent orders
- /api/admin/products/import/preview   : validate, persist ImportJob
- /api/admin/products/import/confirm   : execute persisted job
- /api/admin/import/{job_id}            : poll job status
- /api/admin/chatbot/unanswered         : errored / refusal-flagged logs
- /api/admin/chatbot/{log_id}/resolve   : mark as resolved
"""
from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth.service import decode_token_dep
from app.database import get_db
from app.models.category import Category
from app.models.chatbot_log import ChatbotLog
from app.models.import_job import ImportJob
from app.models.order import Order
from app.models.product import Product
from app.models.variant import Variant
from app.schemas.admin import (
    CategoryToCreate,
    ImportConfirmRequest,
    ImportJobStatus,
    ImportPreviewResponse,
    ProductImportRequest,
    RowError,
)
from app.schemas.user import TokenData
from app.services.import_validator import validate_request

router = APIRouter(prefix="/admin", tags=["admin"])


def get_current_admin_user(token_data: TokenData | None = Depends(decode_token_dep)):
    if token_data is None or token_data.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return token_data


@router.get("/dashboard", response_model=dict)
async def admin_dashboard(
    db: AsyncSession = Depends(get_db),
    current_admin: TokenData = Depends(get_current_admin_user),
):
    total_products = (
        await db.execute(
            select(func.count(Product.id)).where(Product.is_active.is_(True))
        )
    ).scalar() or 0
    total_orders = (await db.execute(select(func.count(Order.id)))).scalar() or 0
    total_revenue = (
        await db.execute(
            select(func.coalesce(func.sum(Order.total), 0)).where(Order.status == "paid")
        )
    ).scalar() or 0
    low_stock_count = (
        await db.execute(
            select(func.count(Variant.id)).where(Variant.stock < 5)
        )
    ).scalar() or 0

    recent_orders_rows = (
        await db.execute(
            select(Order).order_by(Order.created_at.desc()).limit(5)
        )
    ).scalars().all()

    low_stock_rows = (
        await db.execute(
            select(Variant)
            .where(Variant.stock < 5)
            .join(Product)
            .options(selectinload(Variant.product))
            .limit(10)
        )
    ).scalars().all()

    return {
        "total_products": total_products,
        "total_orders": total_orders,
        "total_revenue": total_revenue,
        "low_stock_count": low_stock_count,
        "recent_orders": [
            {
                "id": o.id,
                "status": o.status,
                "total": o.total,
                "created_at": o.created_at.isoformat() if o.created_at else None,
            }
            for o in recent_orders_rows
        ],
        "low_stock_products": [
            {
                "product_name": v.product.name,
                "variant_id": v.id,
                "size": v.size,
                "color": v.color,
                "stock": v.stock,
            }
            for v in low_stock_rows
        ],
    }


# ---- Import: preview (persists the job) ----

@router.post("/products/import/preview", response_model=ImportPreviewResponse)
async def preview_import(
    import_data: ProductImportRequest,
    db: AsyncSession = Depends(get_db),
    current_admin: TokenData = Depends(get_current_admin_user),
):
    existing_categories = {
        row.name
        for row in (await db.execute(select(Category.name))).all()
    }
    existing_slugs = {row.slug for row in (await db.execute(select(Product.slug))).all()}

    row_errors, cats_to_create, would_create, would_update = validate_request(
        import_data,
        existing_slugs=existing_slugs,
        existing_categories=existing_categories,
    )

    job = ImportJob(
        status="pending",
        schema_version=import_data.schema_version,
        payload=import_data.model_dump(),
        total_products=len(import_data.products),
        would_create=would_create,
        would_update=would_update,
        categories_to_create=[
            {"name": n, "slug": s} for n, s in cats_to_create.items()
        ],
        row_errors=[e.model_dump() for e in row_errors],
        admin_user_id=current_admin.user_id,
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)

    return ImportPreviewResponse(
        job_id=job.id,
        status=job.status,
        schema_version=job.schema_version,
        total_products=job.total_products,
        would_create=job.would_create,
        would_update=job.would_update,
        categories_to_create=[
            CategoryToCreate(name=n, slug=s) for n, s in cats_to_create.items()
        ],
        row_errors=row_errors,
    )


# ---- Import: confirm (executes the persisted job) ----

@router.post("/products/import/confirm", response_model=ImportJobStatus)
async def confirm_import(
    confirm_data: ImportConfirmRequest,
    db: AsyncSession = Depends(get_db),
    current_admin: TokenData = Depends(get_current_admin_user),
):
    job = (await db.execute(select(ImportJob).where(ImportJob.id == confirm_data.job_id))).scalar_one_or_none()
    if job is None:
        raise HTTPException(status_code=404, detail="Import job not found")
    if job.admin_user_id != current_admin.user_id:
        raise HTTPException(status_code=403, detail="Not your import job")
    if job.status != "pending":
        raise HTTPException(
            status_code=400, detail=f"Import job is {job.status!r}, cannot confirm"
        )
    if job.row_errors:
        # Refuse to import anything if the preview surfaced errors. The
        # admin must fix the file and re-upload.
        raise HTTPException(
            status_code=400,
            detail="Import job has validation errors; fix and re-upload",
        )

    job.status = "processing"
    await db.commit()

    try:
        request = ProductImportRequest(**job.payload)
    except Exception as e:
        job.status = "failed"
        job.import_errors = [{"phase": "decode", "error": str(e)}]
        job.completed_at = datetime.utcnow()
        await db.commit()
        return _job_to_status(job)

    try:
        imported, import_errors = await _execute_import(db, request)
        job.imported_count = imported
        job.import_errors = import_errors
        if import_errors:
            job.status = "completed_with_errors"
        else:
            job.status = "completed"
    except Exception as e:
        await db.rollback()
        job.status = "failed"
        job.import_errors = [{"phase": "import", "error": str(e)}]

    job.completed_at = datetime.utcnow()
    await db.commit()
    return _job_to_status(job)


async def _execute_import(db: AsyncSession, request: ProductImportRequest) -> int:
    """Actually create categories, products, and variants.

    Idempotency: a slug that already exists is SKIPPED (not overwritten)
    so re-running confirm is safe. The import_errors list captures
    skipped slugs so the admin sees what happened.
    """
    existing_categories = {
        row.name: row.id
        for row in (await db.execute(select(Category.name, Category.id))).all()
    }
    existing_slugs = {
        row.slug
        for row in (await db.execute(select(Product.slug))).all()
    }
    existing_skus = {
        row.sku
        for row in (await db.execute(select(Variant.sku))).all()
    }

    imported = 0
    import_errors: list[dict] = []

    for product_data in request.products:
        slug = product_data.slug or (product_data.name or "").lower().replace(" ", "-")
        if slug in existing_slugs:
            import_errors.append(
                {"phase": "import", "slug": slug, "error": "slug already exists; skipped"}
            )
            continue

        category_name = product_data.category
        if category_name not in existing_categories:
            category = Category(
                name=category_name,
                slug=category_name.lower().replace(" ", "-"),
            )
            db.add(category)
            await db.flush()
            existing_categories[category_name] = category.id

        try:
            product = Product(
                name=product_data.name,
                slug=slug,
                description=product_data.description,
                category_id=existing_categories[category_name],
                images=product_data.images,
                tags=product_data.tags,
                is_active=True,
            )
            db.add(product)
            await db.flush()
        except Exception as e:
            import_errors.append(
                {"phase": "import", "slug": slug, "error": f"product create: {e}"}
            )
            continue

        for var_idx, variant_data in enumerate(product_data.variants):
            sku = variant_data.sku or f"{slug}-{variant_data.size}-{variant_data.color}"
            if sku in existing_skus:
                # Disambiguate by appending a counter so the unique
                # constraint doesn't fail. The admin can rename later.
                base = sku
                n = 2
                while sku in existing_skus:
                    sku = f"{base}-{n}"
                    n += 1
            existing_skus.add(sku)
            variant = Variant(
                product_id=product.id,
                size=variant_data.size,
                color=variant_data.color,
                price=variant_data.price,
                stock=variant_data.stock,
                sku=sku,
                images=variant_data.images,
            )
            db.add(variant)

        existing_slugs.add(slug)
        imported += 1

    await db.commit()

    return imported, import_errors


@router.get("/import/{job_id}", response_model=ImportJobStatus)
async def get_import_status(
    job_id: str,
    db: AsyncSession = Depends(get_db),
    current_admin: TokenData = Depends(get_current_admin_user),
):
    job = (await db.execute(select(ImportJob).where(ImportJob.id == job_id))).scalar_one_or_none()
    if job is None:
        raise HTTPException(status_code=404, detail="Import job not found")
    if job.admin_user_id != current_admin.user_id:
        raise HTTPException(status_code=403, detail="Not your import job")
    return _job_to_status(job)


def _job_to_status(job: ImportJob) -> ImportJobStatus:
    return ImportJobStatus(
        job_id=job.id,
        status=job.status,
        schema_version=job.schema_version,
        total_products=job.total_products,
        imported_count=job.imported_count,
        would_create=job.would_create,
        would_update=job.would_update,
        categories_to_create=[
            CategoryToCreate(**c) for c in job.categories_to_create
        ],
        row_errors=[RowError(**e) for e in job.row_errors],
        import_errors=[str(e.get("error", e)) for e in job.import_errors],
        created_at=job.created_at,
        completed_at=job.completed_at,
    )


# ---- Chatbot admin (PLAN 4.7) ----

_REFUSAL_KEYWORDS = (
    "i can't help",
    "i cannot help",
    "i'm not able to",
    "i am not able to",
    "i don't have access",
    "outside the scope",
    "i'm sorry, i cannot",
)


@router.get("/chatbot/unanswered", response_model=dict)
async def chatbot_unanswered(
    db: AsyncSession = Depends(get_db),
    current_admin: TokenData = Depends(get_current_admin_user),
    limit: int = 50,
    offset: int = 0,
):
    """Logs that need admin attention: errored OR refusal-flagged.

    A log is "refusal-flagged" if its response contains a known refusal
    phrase (PLAN §4.7 + the saia-chatbot-prompt skill) OR if the
    chatbot code flagged the response via `is_refusal` (Phase 5).
    """
    refusal_ilikes = [ChatbotLog.response.ilike(f"%{p}%") for p in _REFUSAL_KEYWORDS]
    stmt = (
        select(ChatbotLog)
        .where(
            or_(
                ChatbotLog.error.isnot(None),
                ChatbotLog.is_refusal.is_(True),
                *refusal_ilikes,
            )
        )
        .order_by(ChatbotLog.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    rows = (await db.execute(stmt)).scalars().all()
    items = [
        {
            "id": r.id,
            "user_id": r.user_id,
            "session_id": r.session_id,
            "question": r.question,
            "stripped_text": r.stripped_text,
            "response": r.response,
            "error": r.error,
            "prompt_version": r.prompt_version,
            "is_refusal": r.is_refusal,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "resolved_at": r.resolved_at.isoformat() if r.resolved_at else None,
        }
        for r in rows
    ]
    return {"items": items, "limit": limit, "offset": offset}


@router.post("/chatbot/{log_id}/resolve", response_model=dict)
async def chatbot_resolve(
    log_id: int,
    db: AsyncSession = Depends(get_db),
    current_admin: TokenData = Depends(get_current_admin_user),
):
    log = (
        await db.execute(select(ChatbotLog).where(ChatbotLog.id == log_id))
    ).scalar_one_or_none()
    if log is None:
        raise HTTPException(status_code=404, detail="Chatbot log not found")
    log.resolved_at = datetime.utcnow()
    log.resolved_by_id = current_admin.user_id
    from app.services.audit import record_audit
    await record_audit(
        db,
        admin_user_id=current_admin.user_id,
        action="resolve",
        entity_type="chatbot_log",
        entity_id=log.id,
    )
    await db.commit()
    return {"id": log.id, "resolved_at": log.resolved_at.isoformat()}


# ---- PLAN 7.3 — Audit log viewer ----

@router.get("/audit", response_model=dict)
async def list_audit_log(
    db: AsyncSession = Depends(get_db),
    current_admin: TokenData = Depends(get_current_admin_user),
    limit: int = 50,
    offset: int = 0,
    action: str | None = None,
    entity_type: str | None = None,
    entity_id: int | None = None,
    admin_user_id: int | None = None,
):
    """List audit log entries (admin-only). Supports basic filtering
    and pagination. Newest first.
    """
    from app.models.audit_log import AuditLog

    stmt = select(AuditLog)
    if action:
        stmt = stmt.where(AuditLog.action == action)
    if entity_type:
        stmt = stmt.where(AuditLog.entity_type == entity_type)
    if entity_id is not None:
        stmt = stmt.where(AuditLog.entity_id == entity_id)
    if admin_user_id is not None:
        stmt = stmt.where(AuditLog.admin_user_id == admin_user_id)
    stmt = stmt.order_by(AuditLog.created_at.desc()).offset(offset).limit(limit)
    rows = (await db.execute(stmt)).scalars().all()
    items = [
        {
            "id": r.id,
            "admin_user_id": r.admin_user_id,
            "action": r.action,
            "entity_type": r.entity_type,
            "entity_id": r.entity_id,
            "details": r.details,
            "ip": r.ip,
            "ua": r.ua,
            "method": r.method,
            "path": r.path,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]
    return {"items": items, "limit": limit, "offset": offset}
