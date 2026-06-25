from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth.service import decode_token
from app.database import get_db
from app.models.category import Category
from app.models.product import Product
from app.models.variant import Variant
from app.schemas.user import TokenData

router = APIRouter(prefix="/products", tags=["products"])


def get_current_admin_user(token_data: Annotated[TokenData | None, Depends(decode_token)]):
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
):
    offset = (page - 1) * page_size
    stmt = select(Product).options(selectinload(Product.variants))

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


@router.get("/{slug}", response_model=dict)
async def get_product(slug: str, db: AsyncSession = Depends(get_db)):
    stmt = select(Product).options(selectinload(Product.variants)).where(Product.slug == slug)
    result = await db.execute(stmt)
    product = result.scalar_one_or_none()

    if product is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Product not found",
        )

    return {
        "id": product.id,
        "name": product.name,
        "slug": product.slug,
        "description": product.description,
        "category_id": product.category_id,
        "images": product.images,
        "meta_title": product.meta_title,
        "meta_description": product.meta_description,
        "tags": product.tags,
        "created_at": product.created_at,
        "updated_at": product.updated_at,
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
            for v in product.variants
        ],
    }


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
