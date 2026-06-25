import re

from pydantic import BaseModel, Field, field_validator


SLUG_RE = re.compile(r"^[a-z0-9-]+$")
SKU_RE = re.compile(r"^[A-Z0-9-]{1,64}$")

# PLAN 4.4: validation ranges
MIN_PRICE_CENTS = 1
MAX_PRICE_CENTS = 1_000_000  # $10,000
MAX_STOCK = 100_000
MAX_VARIANTS = 50
MAX_TAG_LENGTH = 32
MAX_TAGS_PER_PRODUCT = 10
MAX_CATEGORY_LENGTH = 64
MAX_NAME_LENGTH = 200
MAX_SLUG_LENGTH = 120


class ImportVariant(BaseModel):
    size: str = Field(..., min_length=1, max_length=32)
    color: str = Field(..., min_length=1, max_length=32)
    price: int = Field(..., ge=MIN_PRICE_CENTS, le=MAX_PRICE_CENTS)
    stock: int = Field(default=0, ge=0, le=MAX_STOCK)
    sku: str | None = Field(None, max_length=64)
    images: list[str] = Field(default_factory=list)

    @field_validator("sku")
    @classmethod
    def _sku_format(cls, v: str | None) -> str | None:
        if v is None or v == "":
            return v
        if not SKU_RE.match(v):
            raise ValueError(
                "sku must match ^[A-Z0-9-]{1,64}$ (uppercase, digits, hyphens)"
            )
        return v

    @field_validator("images")
    @classmethod
    def _image_url_format(cls, v: list[str]) -> list[str]:
        for url in v:
            if not (url.startswith("https://") or url.startswith("/")):
                raise ValueError(
                    f"image url must start with https:// or / (got: {url!r})"
                )
        return v


class ImportProduct(BaseModel):
    name: str = Field(..., min_length=1, max_length=MAX_NAME_LENGTH)
    slug: str | None = Field(None, max_length=MAX_SLUG_LENGTH)
    description: str = Field(..., min_length=1)
    category: str = Field(..., min_length=1, max_length=MAX_CATEGORY_LENGTH)
    variants: list[ImportVariant] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    images: list[str] = Field(default_factory=list)

    @field_validator("slug")
    @classmethod
    def _slug_format(cls, v: str | None) -> str | None:
        if v is None or v == "":
            return v
        if not SLUG_RE.match(v):
            raise ValueError("slug must match ^[a-z0-9-]+$")
        return v

    @field_validator("tags")
    @classmethod
    def _tag_lengths(cls, v: list[str]) -> list[str]:
        if len(v) > MAX_TAGS_PER_PRODUCT:
            raise ValueError(f"at most {MAX_TAGS_PER_PRODUCT} tags per product")
        for t in v:
            if len(t) > MAX_TAG_LENGTH:
                raise ValueError(f"tag {t!r} exceeds {MAX_TAG_LENGTH} chars")
        return v

    @field_validator("images")
    @classmethod
    def _image_url_format(cls, v: list[str]) -> list[str]:
        for url in v:
            if not (url.startswith("https://") or url.startswith("/")):
                raise ValueError(
                    f"image url must start with https:// or / (got: {url!r})"
                )
        return v


class ProductImportRequest(BaseModel):
    """PLAN 4.4: schema_version 1 is the only supported version today.

    Future versions will be branched on this field, so the on-the-wire
    payload always carries a version header (forward-compat).
    """

    schema_version: int = Field(default=1, ge=1)
    products: list[ImportProduct] = Field(default_factory=list)


class RowError(BaseModel):
    row_number: int
    field: str
    message: str


class CategoryToCreate(BaseModel):
    name: str
    slug: str


class ImportPreviewResponse(BaseModel):
    job_id: str
    status: str
    schema_version: int
    total_products: int
    would_create: int
    would_update: int
    categories_to_create: list[CategoryToCreate] = Field(default_factory=list)
    row_errors: list[RowError] = Field(default_factory=list)


class ImportConfirmRequest(BaseModel):
    job_id: str


class ImportJobStatus(BaseModel):
    job_id: str
    status: str
    schema_version: int
    total_products: int
    imported_count: int = 0
    would_create: int = 0
    would_update: int = 0
    categories_to_create: list[CategoryToCreate] = Field(default_factory=list)
    row_errors: list[RowError] = Field(default_factory=list)
    import_errors: list[str] = Field(default_factory=list)
    created_at: datetime | None = None
    completed_at: datetime | None = None
