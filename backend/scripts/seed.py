"""Seed script for the ModestWear dev database.

Usage:
    python -m backend.scripts.seed            # idempotent (skip if already seeded)
    python -m backend.scripts.seed --reset    # truncate product/variant/category tables, then re-seed

Reads backend/sample_products.json. Creates required categories (Dresses, Khimar
plus any extra categories referenced in the JSON), an admin user from
ADMIN_EMAIL / ADMIN_PASSWORD env vars, and the sample products + variants.

The admin password defaults to "changeme" in dev only — pass ADMIN_PASSWORD
explicitly in any non-local environment.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from pathlib import Path

from argon2 import PasswordHasher

from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import async_session_maker, engine
from app.models import (
    Category,
    Product,
    User,
    Variant,
)
from app.models.base import Base

_password_hasher = PasswordHasher()


def _hash_password(password: str) -> str:
    return _password_hasher.hash(password)

REQUIRED_CATEGORIES = ["Dresses", "Khimar"]

SAMPLE_PRODUCTS_JSON = (
    Path(__file__).resolve().parent.parent / "sample_products.json"
)

DEFAULT_ADMIN_EMAIL = "admin@modestwear.com"
DEFAULT_ADMIN_PASSWORD = "changeme"


def _slugify(name: str) -> str:
    return name.lower().strip().replace(" ", "-")


async def _get_or_create_categories(
    session: AsyncSession, names: list[str]
) -> dict[str, Category]:
    result = await session.execute(
        select(Category).where(Category.name.in_(names))
    )
    by_name = {c.name: c for c in result.scalars().all()}
    created = 0
    for name in names:
        if name in by_name:
            continue
        cat = Category(name=name, slug=_slugify(name))
        session.add(cat)
        by_name[name] = cat
        created += 1
    if created:
        await session.flush()
    return by_name


async def _get_or_create_admin(session: AsyncSession) -> tuple[User, bool]:
    admin_email = os.environ.get("ADMIN_EMAIL", DEFAULT_ADMIN_EMAIL)
    admin_password = os.environ.get(
        "ADMIN_PASSWORD", DEFAULT_ADMIN_PASSWORD
    )

    result = await session.execute(
        select(User).where(User.email == admin_email)
    )
    existing = result.scalar_one_or_none()
    if existing is not None:
        if existing.role != "admin":
            existing.role = "admin"
            await session.flush()
            return existing, True
        return existing, False

    user = User(
        email=admin_email,
        password_hash=_hash_password(admin_password),
        first_name="Admin",
        last_name="ModestWear",
        role="admin",
    )
    session.add(user)
    await session.flush()
    return user, True


async def _product_exists(session: AsyncSession, slug: str) -> bool:
    result = await session.execute(
        select(Product.id).where(Product.slug == slug)
    )
    return result.scalar_one_or_none() is not None


async def _seed_products(
    session: AsyncSession, products: list[dict], category_map: dict[str, Category]
) -> tuple[int, int, int, int]:
    products_created = 0
    products_skipped = 0
    variants_created = 0
    variants_skipped = 0

    for p in products:
        slug = p["slug"]
        if await _product_exists(session, slug):
            products_skipped += 1
            continue

        cat_name = p["category"]
        category = category_map.get(cat_name)
        if category is None:
            category_map = await _get_or_create_categories(session, [cat_name])
            category = category_map[cat_name]

        product = Product(
            name=p["name"],
            slug=slug,
            description=p["description"],
            category_id=category.id,
            images=p.get("images", []),
            tags=p.get("tags", []),
        )
        session.add(product)
        await session.flush()

        for v in p["variants"]:
            variant = Variant(
                product_id=product.id,
                size=v["size"],
                color=v["color"],
                sku=v["sku"],
                price=v["price"],
                stock=v["stock"],
                images=v.get("images", []),
            )
            session.add(variant)
            variants_created += 1

        products_created += 1

    return products_created, products_skipped, variants_created, variants_skipped


async def _truncate_product_tables(session: AsyncSession) -> None:
    await session.execute(delete(Variant))
    await session.execute(delete(Product))
    await session.execute(delete(Category))
    await session.flush()


async def _ensure_schema() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def _run(reset: bool) -> None:
    await _ensure_schema()

    if not SAMPLE_PRODUCTS_JSON.exists():
        print(f"ERROR: {SAMPLE_PRODUCTS_JSON} not found.", file=sys.stderr)
        sys.exit(1)

    with SAMPLE_PRODUCTS_JSON.open("r", encoding="utf-8") as f:
        data = json.load(f)
    products = data.get("products", [])

    if not products:
        print("ERROR: sample_products.json contains no products.", file=sys.stderr)
        sys.exit(1)

    admin_email = os.environ.get("ADMIN_EMAIL", DEFAULT_ADMIN_EMAIL)
    admin_password = os.environ.get("ADMIN_PASSWORD", DEFAULT_ADMIN_PASSWORD)
    if admin_password == DEFAULT_ADMIN_PASSWORD and not os.environ.get(
        "ADMIN_PASSWORD"
    ):
        print(
            f"WARNING: ADMIN_PASSWORD not set; using dev default "
            f"'{DEFAULT_ADMIN_PASSWORD}' for {admin_email}.",
            file=sys.stderr,
        )

    required = list(REQUIRED_CATEGORIES)
    referenced = sorted({p["category"] for p in products})
    all_categories = list({*required, *referenced})

    async with async_session_maker() as session:
        try:
            if reset:
                await _truncate_product_tables(session)
                await session.commit()

            category_map = await _get_or_create_categories(session, all_categories)
            admin_user, admin_created = await _get_or_create_admin(session)
            (
                products_created,
                products_skipped,
                variants_created,
                variants_skipped,
            ) = await _seed_products(session, products, category_map)
            await session.commit()
        except IntegrityError as e:
            await session.rollback()
            print(f"ERROR: database integrity error: {e}", file=sys.stderr)
            sys.exit(1)
        except Exception as e:
            await session.rollback()
            print(f"ERROR: {e}", file=sys.stderr)
            raise

    print("=" * 50)
    print("ModestWear seed complete")
    print("=" * 50)
    print(f"  Admin user:  1 ({'created' if admin_created else 'existing'}) — {admin_email}")
    print(f"  Categories:  {len(category_map)} ({', '.join(sorted(category_map))})")
    if reset:
        print(f"  Products:    {products_created} created (reset mode)")
        print(f"  Variants:    {variants_created} created (reset mode)")
    else:
        print(f"  Products:    {products_created} created, {products_skipped} skipped (already exist)")
        print(f"  Variants:    {variants_created} created")
    print("=" * 50)


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed the ModestWear dev database.")
    parser.add_argument(
        "--reset",
        action="store_true",
        help="Truncate product/variant/category tables before seeding.",
    )
    args = parser.parse_args()
    asyncio.run(_run(reset=args.reset))


if __name__ == "__main__":
    main()
