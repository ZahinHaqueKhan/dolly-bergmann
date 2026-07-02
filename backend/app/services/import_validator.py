"""PLAN 4.4: bulk import validator.

Extracted from `routers/admin.py` so the same validation runs in both
preview and confirm paths (and so a future Phase 5.3 importer CLI can
use it without dragging in FastAPI).
"""
from __future__ import annotations

from collections.abc import Iterable

from app.schemas.admin import (
    MAX_VARIANTS,
    ImportProduct,
    ProductImportRequest,
    RowError,
)


def validate_product(
    product: ImportProduct,
    *,
    row_number: int,
    existing_slugs: set[str],
    existing_categories: set[str],
) -> tuple[list[RowError], str | None, str | None, bool]:
    """Validate a single import product.

    Returns (errors, resolved_slug, resolved_category, would_update).
    `would_update` is True if the resolved slug already exists in the
    DB — the preview can show a dry-run diff to the admin.
    """
    errors: list[RowError] = []

    if not product.name:
        errors.append(RowError(row_number=row_number, field="name", message="Name is required"))
    if not product.description:
        errors.append(
            RowError(row_number=row_number, field="description", message="Description is required")
        )
    if not product.variants:
        errors.append(
            RowError(row_number=row_number, field="variants", message="At least one variant is required")
        )
    if len(product.variants) > MAX_VARIANTS:
        errors.append(
            RowError(
                row_number=row_number,
                field="variants",
                message=f"at most {MAX_VARIANTS} variants per product",
            )
        )
    else:
        for var_idx, variant in enumerate(product.variants):
            if not variant.size:
                errors.append(
                    RowError(
                        row_number=row_number,
                        field=f"variants[{var_idx}].size",
                        message="Size is required",
                    )
                )
            if not variant.color:
                errors.append(
                    RowError(
                        row_number=row_number,
                        field=f"variants[{var_idx}].color",
                        message="Color is required",
                    )
                )

    resolved_slug = product.slug or (product.name or "").lower().replace(" ", "-")
    if resolved_slug and resolved_slug in existing_slugs:
        # Not a hard error — the dry-run reports it as a would_update
        # so the admin can decide whether to skip or overwrite.
        pass

    category = product.category
    if category and category not in existing_categories:
        # New category will be auto-created on confirm.
        pass

    return errors, resolved_slug, category, bool(resolved_slug and resolved_slug in existing_slugs)


def validate_request(
    req: ProductImportRequest,
    *,
    existing_slugs: Iterable[str],
    existing_categories: Iterable[str],
) -> tuple[list[RowError], dict[str, str], int, int]:
    """Validate a full import request.

    Returns:
        (row_errors, categories_to_create, would_create, would_update)
    """
    slugs = set(existing_slugs)
    cats = set(existing_categories)
    cats_to_create: dict[str, str] = {}
    row_errors: list[RowError] = []
    would_create = 0
    would_update = 0

    for idx, p in enumerate(req.products, start=1):
        errs, slug, cat, would_upd = validate_product(
            p,
            row_number=idx,
            existing_slugs=slugs,
            existing_categories=cats,
        )
        row_errors.extend(errs)
        if slug and would_upd:
            would_update += 1
        elif slug:
            would_create += 1
        if cat and cat not in cats:
            cats_to_create[cat] = cat.lower().replace(" ", "-")
            cats.add(cat)

    return row_errors, cats_to_create, would_create, would_update
