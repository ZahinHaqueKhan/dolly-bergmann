import { notFound } from 'next/navigation'
import { adminGet, ServerAuthError } from '@/lib/server-fetch'
import ProductForm from '../../new/ProductForm'

export const dynamic = 'force-dynamic'

interface Category {
  id: number
  name: string
  slug: string
}

interface Variant {
  id: number
  size: string
  color: string
  price: number
  stock: number
  sku: string
  images: string[]
}

interface ProductDetail {
  id: number
  name: string
  slug: string
  description: string
  category_id: number
  images: string[]
  tags: string[]
  is_active: boolean
  variants: Variant[]
}

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  let product: ProductDetail
  let categories: Category[]
  try {
    const [p, c] = await Promise.all([
      adminGet<ProductDetail>(`/api/products/admin/${id}`),
      adminGet<Category[]>('/api/categories'),
    ])
    product = p
    categories = c
  } catch (err) {
    if (err instanceof ServerAuthError && err.status === 404) {
      notFound()
    }
    throw err
  }

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-serif text-stone-800">Edit product</h1>
      </div>
      <ProductForm
        categories={categories}
        initial={{
          id: product.id,
          name: product.name,
          slug: product.slug,
          description: product.description,
          category_id: product.category_id,
          images: product.images,
          tags: product.tags,
          is_active: product.is_active,
          variants: product.variants.map((v) => ({
            id: v.id,
            size: v.size,
            color: v.color,
            price: v.price,
            stock: v.stock,
            sku: v.sku,
            images: v.images,
          })),
        }}
      />
    </>
  )
}
