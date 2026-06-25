import { adminGet } from '@/lib/server-fetch'
import ProductForm from './ProductForm'

export const dynamic = 'force-dynamic'

interface Category {
  id: number
  name: string
  slug: string
}

export default async function NewProductPage() {
  const categories = await adminGet<Category[]>('/api/categories').catch(() => [] as Category[])
  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-serif text-stone-800">Add product</h1>
      </div>
      <ProductForm categories={categories} />
    </>
  )
}
