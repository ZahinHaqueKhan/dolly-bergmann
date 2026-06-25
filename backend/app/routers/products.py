from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth.service import decode_token_dep
from app.database import get_db
from app.models.category import Category
from app.models.product import Product
from app.models.variant import Variant
from app.schemas.user import TokenData

router = APIRouter(prefix="/products", tags=["products"])


def get_current_admin_user(token_data: Annotated[TokenData | None, Depends(decode_token_dep)]):
    if token_data is None or token_data.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return token_data


@router.get("", response_model=list[dict])
async def list_products(
    db: AsyncSession = Depends(get_db),
    category: str | None = Query(None),
    min_price: int | None = Query(None),
    max_price: int | None = Query(None),
    size: str | None = Query(None),
    color: str | None = Query(None),
    search: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    include_inactive: bool = Query(False),
    current_admin: TokenData | None = Depends(decode_token_dep),
):
    """Public catalog. Admins may pass `include_inactive=1` to see
    soft-deleted products (used by the admin products page)."""
    offset = (page - 1) * page_size
    stmt = select(Product).options(selectinload(Product.variants))
    is_admin = current_admin is not None and current_admin.role == "admin"
    if not (include_inactive and is_admin):
        stmt = stmt.where(Product.is_active.is_(True))

    if category:
        stmt = stmt.join(Category).where(Category.slug == category)

    if min_price is not None or max_price is not None or size or color:
        stmt = stmt.join(Variant)
        conditions = []
        if min_price is not None:
            conditions.append(Variant.price >= min_price)
        if max_price is not None:
            conditions.append(Variant.price <= max_price)
        if size:
            conditions.append(Variant.size == size)
        if color:
            conditions.append(Variant.color == color)
        if conditions:
            stmt = stmt.where(and_(*conditions))

    if search:
        stmt = stmt.where(
            or_(
                Product.name.ilike(f"%{search}%"),
                Product.description.ilike(f"%{search}%"),
            )
        )

    stmt = stmt.offset(offset).limit(page_size)
    result = await db.execute(stmt)
    products = result.scalars().all()

    return [
        {
            "id": p.id,
            "name": p.name,
            "slug": p.slug,
            "description": p.description,
            "category_id": p.category_id,
            "images": p.images,
            "meta_title": p.meta_title,
            "meta_description": p.meta_description,
            "tags": p.tags,
            "is_active": p.is_active,
            "created_at": p.created_at,
            "updated_at": p.updated_at,
            "variants": [
                {
                    "id": v.id,
                    "size": v.size,
                    "color": v.color,
                    "price": v.price,
                    "stock": v.stock,
                    "sku": v.sku,
                }
                for v in p.variants
            ],
        }
        for p in products
    ]


def _product_to_dict(p: Product) -> dict:
    """Full product detail (admin view). Includes variant images and
    is_active so the admin form can show and toggle them.
    """
    return {
        "id": p.id,
        "name": p.name,
        "slug": p.slug,
        "description": p.description,
        "category_id": p.category_id,
        "images": p.images,
        "meta_title": p.meta_title,
        "meta_description": p.meta_description,
        "tags": p.tags,
        "is_active": p.is_active,
        "created_at": p.created_at.isoformat() if p.created_at else None,
        "updated_at": p.updated_at.isoformat() if p.updated_at else None,
        "variants": [
            {
                "id": v.id,
                "size": v.size,
                "color": v.color,
                "price": v.price,
                "stock": v.stock,
                "sku": v.sku,
                "images": v.images,
            }
            for v in p.variants
        ],
    }


@router.get("/{slug}", response_model=dict)
async def get_product(slug: str, db: AsyncSession = Depends(get_db)):
    stmt = (
        select(Product)
        .options(selectinload(Product.variants))
        .where(Product.slug == slug, Product.is_active.is_(True))
    )
    result = await db.execute(stmt)
    product = result.scalar_one_or_none()

    if product is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Product not found",
        )

    return _product_to_dict(product)


@router.post("", response_model=dict)
async def create_product(
    product_data: dict,
    db: AsyncSession = Depends(get_db),
    current_admin: TokenData = Depends(get_current_admin_user),
):
    category_stmt = select(Category).where(Category.name == product_data["category"])
    result = await db.execute(category_stmt)
    category = result.scalar_one_or_none()

    if category is None:
        category = Category(
            name=product_data["category"],
            slug=product_data["category"].lower().replace(" ", "-"),
        )
        db.add(category)
        await db.flush()

    product = Product(
        name=product_data["name"],
        slug=product_data.get("slug", product_data["name"].lower().replace(" ", "-")),
        description=product_data["description"],
        category_id=category.id,
        images=product_data.get("images", []),
        meta_title=product_data.get("meta_title"),
        meta_description=product_data.get("meta_description"),
        tags=product_data.get("tags", []),
    )
    db.add(product)
    await db.flush()

    for variant_data in product_data.get("variants", []):
        variant = Variant(
            product_id=product.id,
            size=variant_data["size"],
            color=variant_data["color"],
            price=variant_data["price"],
            stock=variant_data.get("stock", 0),
            sku=variant_data.get("sku", f"{product.slug}-{variant_data['size']}-{variant_data['color']}"),
            images=variant_data.get("images", []),
        )
        db.add(variant)

    await db.commit()
    await db.refresh(product)

    return {"id": product.id, "slug": product.slug, "message": "Product created"}


@router.put("/{product_id}", response_model=dict)
async def update_product(
    product_id: int,
    product_data: dict,
    db: AsyncSession = Depends(get_db),
    current_admin: TokenData = Depends(get_current_admin_user),
):
    stmt = select(Product).where(Product.id == product_id)
    result = await db.execute(stmt)
    product = result.scalar_one_or_none()

    if product is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Product not found",
        )

    if "name" in product_data:
        product.name = product_data["name"]
    if "slug" in product_data:
        product.slug = product_data["slug"]
    if "description" in product_data:
        product.description = product_data["description"]
    if "images" in product_data:
        product.images = product_data["images"]
    if "meta_title" in product_data:
        product.meta_title = product_data["meta_title"]
    if "meta_description" in product_data:
        product.meta_description = product_data["meta_description"]
    if "tags" in product_data:
        product.tags = product_data["tags"]

    if "category" in product_data:
        category_stmt = select(Category).where(Category.name == product_data["category"])
        result = await db.execute(category_stmt)
        category = result.scalar_one_or_none()
        if category is None:
            category = Category(
                name=product_data["category"],
                slug=product_data["category"].lower().replace(" ", "-"),
            )
            db.add(category)
            await db.flush()
            product.category_id = category.id
        else:
            product.category_id = category.id

    if "is_active" in product_data:
        product.is_active = bool(product_data["is_active"])

    await db.commit()
    await db.refresh(product)

    return {"id": product.id, "slug": product.slug, "message": "Product updated"}


@router.delete("/{product_id}", response_model=dict)
async def delete_product(
    product_id: int,
    db: AsyncSession = Depends(get_db),
    current_admin: TokenData = Depends(get_current_admin_user),
):
    stmt = select(Product).where(Product.id == product_id)
    result = await db.execute(stmt)
    product = result.scalar_one_or_none()

    if product is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Product not found",
        )

    await db.delete(product)
    await db.commit()

    return {"message": "Product deleted"}


# ---- Admin-only: get product by ID, bulk actions, and variant updates ----

@router.get("/admin/{product_id}", response_model=dict)
async def admin_get_product(
    product_id: int,
    db: AsyncSession = Depends(get_db),
    current_admin: TokenData = Depends(get_current_admin_user),
):
    stmt = (
        select(Product)
        .options(selectinload(Product.variants))
        .where(Product.id == product_id)
    )
    product = (await db.execute(stmt)).scalar_one_or_none()
    if product is None:
        raise HTTPException(status_code=404, detail="Product not found")
    return _product_to_dict(product)


@router.post("/admin/bulk-active", response_model=dict)
async def admin_bulk_active(
    payload: dict,
    db: AsyncSession = Depends(get_db),
    current_admin: TokenData = Depends(get_current_admin_user),
):
    """Toggle is_active for a list of product IDs.

    payload: {"ids": [int, int, ...], "is_active": bool}
    """
    ids = payload.get("ids") or []
    is_active = bool(payload.get("is_active"))
    if not isinstance(ids, list) or not all(isinstance(i, int) for i in ids):
        raise HTTPException(status_code=400, detail="ids must be list[int]")
    if not ids:
        return {"updated": 0}
    result = await db.execute(
        select(Product).where(Product.id.in_(ids))
    )
    products = result.scalars().all()
    for p in products:
        p.is_active = is_active
    await db.commit()
    return {"updated": len(products), "ids": ids, "is_active": is_active}


@router.post("/admin/bulk-delete", response_model=dict)
async def admin_bulk_delete(
    payload: dict,
    db: AsyncSession = Depends(get_db),
    current_admin: TokenData = Depends(get_current_admin_user),
):
    ids = payload.get("ids") or []
    if not isinstance(ids, list) or not all(isinstance(i, int) for i in ids):
        raise HTTPException(status_code=400, detail="ids must be list[int]")
    if not ids:
        return {"deleted": 0}
    result = await db.execute(select(Product).where(Product.id.in_(ids)))
    products = result.scalars().all()
    for p in products:
        await db.delete(p)
    await db.commit()
    return {"deleted": len(products), "ids": ids}
