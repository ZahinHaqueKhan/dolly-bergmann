from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.service import decode_token
from app.database import get_db
from app.models.category import Category
from app.schemas.user import TokenData

router = APIRouter(prefix="/categories", tags=["categories"])


def get_current_admin_user(token_data: Annotated[TokenData | None, Depends(decode_token)]):
    if token_data is None or not token_data.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return token_data


@router.get("", response_model=list[dict])
async def list_categories(db: AsyncSession = Depends(get_db)):
    stmt = select(Category).order_by(Category.name)
    result = await db.execute(stmt)
    categories = result.scalars().all()

    return [
        {
            "id": c.id,
            "name": c.name,
            "slug": c.slug,
            "description": c.description,
            "image_url": c.image_url,
            "parent_id": c.parent_id,
            "created_at": c.created_at,
        }
        for c in categories
    ]


@router.post("", response_model=dict)
async def create_category(
    category_data: dict,
    db: AsyncSession = Depends(get_db),
    current_admin: TokenData = Depends(get_current_admin_user),
):
    stmt = select(Category).where(Category.slug == category_data["slug"])
    result = await db.execute(stmt)
    existing = result.scalar_one_or_none()

    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Category with this slug already exists",
        )

    category = Category(
        name=category_data["name"],
        slug=category_data["slug"],
        description=category_data.get("description"),
        image_url=category_data.get("image_url"),
        parent_id=category_data.get("parent_id"),
    )
    db.add(category)
    await db.commit()
    await db.refresh(category)

    return {"id": category.id, "slug": category.slug, "message": "Category created"}


@router.put("/{category_id}", response_model=dict)
async def update_category(
    category_id: int,
    category_data: dict,
    db: AsyncSession = Depends(get_db),
    current_admin: TokenData = Depends(get_current_admin_user),
):
    stmt = select(Category).where(Category.id == category_id)
    result = await db.execute(stmt)
    category = result.scalar_one_or_none()

    if category is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Category not found",
        )

    if "name" in category_data:
        category.name = category_data["name"]
    if "slug" in category_data:
        category.slug = category_data["slug"]
    if "description" in category_data:
        category.description = category_data["description"]
    if "image_url" in category_data:
        category.image_url = category_data["image_url"]
    if "parent_id" in category_data:
        category.parent_id = category_data["parent_id"]

    await db.commit()
    await db.refresh(category)

    return {"id": category.id, "slug": category.slug, "message": "Category updated"}


@router.delete("/{category_id}", response_model=dict)
async def delete_category(
    category_id: int,
    db: AsyncSession = Depends(get_db),
    current_admin: TokenData = Depends(get_current_admin_user),
):
    stmt = select(Category).where(Category.id == category_id)
    result = await db.execute(stmt)
    category = result.scalar_one_or_none()

    if category is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Category not found",
        )

    await db.delete(category)
    await db.commit()

    return {"message": "Category deleted"}
