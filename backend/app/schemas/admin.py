from pydantic import BaseModel, Field


class ImportVariant(BaseModel):
    size: str = Field(..., min_length=1)
    color: str = Field(..., min_length=1)
    price: int = Field(..., gt=0)
    stock: int = Field(default=0, ge=0)
    sku: str | None = None
    images: list[str] = Field(default_factory=list)


class ImportProduct(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    slug: str | None = Field(None, min_length=1, max_length=200)
    description: str = Field(..., min_length=1)
    category: str = Field(..., min_length=1)
    variants: list[ImportVariant] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)


class ProductImportRequest(BaseModel):
    products: list[ImportProduct] = Field(default_factory=list)


class RowError(BaseModel):
    row_number: int
    field: str
    message: str


class CategoryToCreate(BaseModel):
    name: str
    slug: str


class ImportPreviewResponse(BaseModel):
    total_products: int
    categories_to_create: list[CategoryToCreate] = Field(default_factory=list)
    row_errors: list[RowError] = Field(default_factory=list)


class ImportConfirmRequest(BaseModel):
    job_id: str


class ImportJobStatus(BaseModel):
    job_id: str
    status: str
    imported_count: int = 0
    errors: list[str] = Field(default_factory=list)
