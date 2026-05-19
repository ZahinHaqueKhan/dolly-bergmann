import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.service import decode_token
from app.database import get_db
from app.models.category import Category
from app.models.order import Order
from app.models.product import Product
from app.models.variant import Variant
from app.schemas.admin import (
    ImportConfirmRequest,
    ImportJobStatus,
    ImportPreviewResponse,
    ImportProduct,
    ProductImportRequest,
    RowError,
)
from app.schemas.user import TokenData

router = APIRouter(prefix="/admin", tags=["admin"])

import_jobs: dict[str, dict] = {}


def get_current_admin_user(token_data: TokenData | None = Depends(decode_token)):
    if token_data is None or not token_data.is_admin:
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
    total_products_stmt = select(func.count(Product.id))
    result = await db.execute(total_products_stmt)
    total_products = result.scalar() or 0

    total_orders_stmt = select(func.count(Order.id))
    result = await db.execute(total_orders_stmt)
    total_orders = result.scalar() or 0

    total_revenue_stmt = select(func.sum(Order.total)).where(Order.status == "paid")
    result = await db.execute(total_revenue_stmt)
    total_revenue = result.scalar() or 0

    recent_orders_stmt = (
        select(Order)
        .order_by(Order.created_at.desc())
        .limit(5)
    )
    result = await db.execute(recent_orders_stmt)
    recent_orders = result.scalars().all()

    low_stock_stmt = (
        select(Variant)
        .where(Variant.stock < 5)
        .join(Product)
        .limit(10)
    )
    result = await db.execute(low_stock_stmt)
    low_stock_variants = result.scalars().all()

    return {
        "total_products": total_products,
        "total_orders": total_orders,
        "total_revenue": total_revenue,
        "recent_orders": [
            {
                "id": o.id,
                "status": o.status,
                "total": o.total,
                "created_at": o.created_at,
            }
            for o in recent_orders
        ],
        "low_stock_products": [
            {
                "product_name": v.product.name,
                "variant_id": v.id,
                "size": v.size,
                "color": v.color,
                "stock": v.stock,
            }
            for v in low_stock_variants
        ],
    }


@router.post("/products/import/preview", response_model=ImportPreviewResponse)
async def preview_import(
    import_data: ProductImportRequest,
    db: AsyncSession = Depends(get_db),
    current_admin: TokenData = Depends(get_current_admin_user),
):
    row_errors: list[RowError] = []
    categories_to_create: dict[str, str] = {}

    existing_categories_stmt = select(Category.name, Category.slug)
    result = await db.execute(existing_categories_stmt)
    existing_categories = {row.name: row.slug for row in result.all()}

    existing_slugs_stmt = select(Product.slug)
    result = await db.execute(existing_slugs_stmt)
    existing_slugs = {row.slug for row in result.all()}

    for idx, product_data in enumerate(import_data.products, start=1):
        if not product_data.name:
            row_errors.append(RowError(row_number=idx, field="name", message="Name is required"))

        if not product_data.description:
            row_errors.append(RowError(row_number=idx, field="description", message="Description is required"))

        if not product_data.variants:
            row_errors.append(RowError(row_number=idx, field="variants", message="At least one variant is required"))
        else:
            for var_idx, variant in enumerate(product_data.variants):
                if not variant.size:
                    row_errors.append(
                        RowError(row_number=idx, field=f"variants[{var_idx}].size", message="Size is required")
                    )
                if not variant.color:
                    row_errors.append(
                        RowError(row_number=idx, field=f"variants[{var_idx}].color", message="Color is required")
                    )
                if variant.price <= 0:
                    row_errors.append(
                        RowError(row_number=idx, field=f"variants[{var_idx}].price", message="Price must be > 0")
                    )

        slug = product_data.slug or product_data.name.lower().replace(" ", "-")
        if slug in existing_slugs:
            row_errors.append(RowError(row_number=idx, field="slug", message=f"Slug '{slug}' already exists"))

        category_name = product_data.category
        if category_name not in existing_categories:
            category_slug = category_name.lower().replace(" ", "-")
            categories_to_create[category_name] = category_slug

    return ImportPreviewResponse(
        total_products=len(import_data.products),
        categories_to_create=[
            {"name": name, "slug": slug} for name, slug in categories_to_create.items()
        ],
        row_errors=row_errors,
    )


@router.post("/products/import/confirm", response_model=ImportJobStatus)
async def confirm_import(
    confirm_data: ImportConfirmRequest,
    db: AsyncSession = Depends(get_db),
    current_admin: TokenData = Depends(get_current_admin_user),
):
    job = import_jobs.get(confirm_data.job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Import job not found")

    if job["status"] != "pending":
        raise HTTPException(status_code=400, detail=f"Import job is {job['status']}")

    job["status"] = "processing"

    try:
        import_data = ProductImportRequest(**job["data"])
        imported_count = 0
        errors: list[str] = []

        existing_categories_stmt = select(Category.name, Category.id)
        result = await db.execute(existing_categories_stmt)
        category_map = {row.name: row.id for row in result.all()}

        for product_data in import_data.products:
            try:
                category_name = product_data.category
                if category_name not in category_map:
                    category_slug = category_name.lower().replace(" ", "-")
                    category = Category(name=category_name, slug=category_slug)
                    db.add(category)
                    await db.flush()
                    category_map[category_name] = category.id

                slug = product_data.slug or product_data.name.lower().replace(" ", "-")
                product = Product(
                    name=product_data.name,
                    slug=slug,
                    description=product_data.description,
                    category_id=category_map[category_name],
                    tags=product_data.tags,
                )
                db.add(product)
                await db.flush()

                for variant_data in product_data.variants:
                    sku = variant_data.sku or f"{slug}-{variant_data.size}-{variant_data.color}"
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

                imported_count += 1
            except Exception as e:
                errors.append(f"Product '{product_data.name}': {str(e)}")

        await db.commit()

        job["status"] = "completed"
        job["imported_count"] = imported_count
        job["errors"] = errors

    except Exception as e:
        await db.rollback()
        job["status"] = "failed"
        job["errors"] = [str(e)]

    return ImportJobStatus(
        job_id=confirm_data.job_id,
        status=job["status"],
        imported_count=job.get("imported_count", 0),
        errors=job.get("errors", []),
    )


@router.get("/import/{job_id}", response_model=ImportJobStatus)
async def get_import_status(
    job_id: str,
    current_admin: TokenData = Depends(get_current_admin_user),
):
    job = import_jobs.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Import job not found")

    return ImportJobStatus(
        job_id=job_id,
        status=job["status"],
        imported_count=job.get("imported_count", 0),
        errors=job.get("errors", []),
    )
