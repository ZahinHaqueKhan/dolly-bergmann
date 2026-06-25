'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import toast from 'react-hot-toast'
import VariantEditor, { type VariantDraft } from '../VariantEditor'
import {
  adminClientPost,
  adminClientPut,
  adminClientUpload,
  AdminClientError,
} from '@/lib/admin-client'

interface Category {
  id: number
  name: string
  slug: string
}

interface InitialImage {
  url: string
}

export default function ProductForm({
  categories,
  initial,
}: {
  categories: Category[]
  initial?: {
    id: number
    name: string
    slug: string
    description: string
    category_id: number
    images: string[]
    tags: string[]
    is_active: boolean
    variants: VariantDraft[]
  }
}) {
  const router = useRouter()
  const isEdit = !!initial

  const [name, setName] = useState(initial?.name ?? '')
  const [slug, setSlug] = useState(initial?.slug ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [categoryId, setCategoryId] = useState<number | ''>(initial?.category_id ?? '')
  const [tags, setTags] = useState((initial?.tags ?? []).join(', '))
  const [isActive, setIsActive] = useState(initial?.is_active ?? true)
  const [variants, setVariants] = useState<VariantDraft[]>(initial?.variants ?? [])
  const [images, setImages] = useState<InitialImage[]>(
    (initial?.images ?? []).map((url) => ({ url })),
  )
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const uploadOne = async (file: File): Promise<string | null> => {
    try {
      const res = await adminClientUpload(file)
      return res.url
    } catch (e) {
      const msg = e instanceof AdminClientError ? e.message : String(e)
      toast.error(`Upload failed: ${msg}`)
      return null
    }
  }

  const handleImageAdd = async (files: FileList | null) => {
    if (!files) return
    for (const f of Array.from(files)) {
      const url = await uploadOne(f)
      if (url) setImages((cur) => [...cur, { url }])
    }
  }

  const removeImage = (idx: number) =>
    setImages((cur) => cur.filter((_, i) => i !== idx))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!name || !description || !categoryId) {
      setError('Name, description, and category are required.')
      return
    }
    if (variants.length === 0) {
      setError('Add at least one variant.')
      return
    }
    setSubmitting(true)
    try {
      const cat = categories.find((c) => c.id === categoryId)
      const body = {
        name,
        slug: slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        description,
        category: cat?.name ?? '',
        images: images.map((i) => i.url),
        tags: tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        is_active: isActive,
        variants: variants.map((v) => ({
          size: v.size,
          color: v.color,
          price: v.price,
          stock: v.stock,
          sku: v.sku || undefined,
          images: v.images,
        })),
      }
      if (isEdit && initial) {
        await adminClientPut(`/api/products/${initial.id}`, body)
        toast.success('Product updated')
      } else {
        await adminClientPost('/api/products', body)
        toast.success('Product created')
      }
      router.push('/admin/products')
      router.refresh()
    } catch (e) {
      const msg = e instanceof AdminClientError ? e.message : String(e)
      setError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6" noValidate>
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
          {error}
        </div>
      )}

      <div className="bg-white rounded-xl border border-stone-200 p-6 space-y-4">
        <h2 className="font-serif text-lg text-stone-800">Details</h2>
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Name</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">
              Slug <span className="text-stone-400 font-normal">(blank = derived from name)</span>
            </label>
            <input
              type="text"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              pattern="[a-z0-9-]+"
              className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1">Description</label>
          <textarea
            required
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
          />
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Category</label>
            <select
              required
              value={categoryId === '' ? '' : categoryId}
              onChange={(e) =>
                setCategoryId(e.target.value === '' ? '' : Number(e.target.value))
              }
              className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
            >
              <option value="">Select a category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <p className="text-xs text-stone-400 mt-1">
              New categories are auto-created on save.
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">
              Tags <span className="text-stone-400 font-normal">(comma-separated)</span>
            </label>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
            />
          </div>
        </div>

        <div>
          <label className="flex items-center gap-2 text-sm text-stone-700">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="rounded border-stone-300"
            />
            <span>Active (visible on storefront)</span>
          </label>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-stone-200 p-6 space-y-4">
        <h2 className="font-serif text-lg text-stone-800">Images</h2>
        <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
          {images.map((img, idx) => (
            <div
              key={`${img.url}-${idx}`}
              className="aspect-square bg-stone-100 rounded-lg overflow-hidden relative group"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.url} alt="" className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => removeImage(idx)}
                className="absolute top-1 right-1 bg-white/90 rounded-full p-1 text-stone-700 text-xs opacity-0 group-hover:opacity-100"
                aria-label="Remove image"
              >
                ✕
              </button>
            </div>
          ))}
          <label className="aspect-square bg-stone-50 border-2 border-dashed border-stone-200 rounded-lg flex items-center justify-center text-stone-400 text-sm cursor-pointer hover:border-stone-300">
            +
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif"
              multiple
              className="hidden"
              onChange={(e) => handleImageAdd(e.target.files)}
            />
          </label>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-stone-200 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-lg text-stone-800">Variants</h2>
          <span className="text-xs text-stone-400">{variants.length} / 50</span>
        </div>
        <VariantEditor value={variants} onChange={setVariants} />
      </div>

      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={() => router.push('/admin/products')}
          className="px-4 py-2 border border-stone-300 text-stone-700 rounded-lg text-sm font-medium hover:bg-stone-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="px-4 py-2 bg-stone-800 text-white rounded-lg text-sm font-medium hover:bg-stone-700 disabled:opacity-50"
        >
          {submitting ? 'Saving…' : isEdit ? 'Save changes' : 'Create product'}
        </button>
      </div>
    </form>
  )
}
