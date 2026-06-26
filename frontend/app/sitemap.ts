import { MetadataRoute } from 'next'

const API_BASE_URL =
  process.env.BACKEND_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  'http://127.0.0.1:8000'

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || 'https://modestwear.com'

interface ApiProduct {
  id: number
  slug: string
  is_active: boolean
  updated_at: string | null
  created_at: string | null
}

interface ApiCategory {
  id: number
  slug: string
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Static B2C pages (indexable). /wholesale/*, /admin/*, /account/* are
  // explicitly disallowed in robots.ts and excluded here.
  const staticPages: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified: new Date(), changeFrequency: 'weekly', priority: 1.0 },
    { url: `${SITE_URL}/shop`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.9 },
    { url: `${SITE_URL}/about`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
    { url: `${SITE_URL}/size-guide`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
    { url: `${SITE_URL}/shipping`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
    { url: `${SITE_URL}/returns`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
  ]

  // Fetch all active B2C products from the backend. Cache for 1 hour;
  // the sitemap is rebuilt on each request but only on-demand (it's
  // not a hot path).
  let productPages: MetadataRoute.Sitemap = []
  let categoryPages: MetadataRoute.Sitemap = []
  try {
    const [pRes, cRes] = await Promise.all([
      fetch(`${API_BASE_URL}/api/products?page_size=100`, {
        next: { revalidate: 3600 },
      }),
      fetch(`${API_BASE_URL}/api/categories`, {
        next: { revalidate: 3600 },
      }),
    ])
    if (pRes.ok) {
      const products = (await pRes.json()) as ApiProduct[]
      productPages = products
        .filter((p) => p.is_active)
        .map((p) => ({
          url: `${SITE_URL}/product/${p.slug}`,
          lastModified: p.updated_at ? new Date(p.updated_at) : new Date(),
          changeFrequency: 'weekly' as const,
          priority: 0.8,
        }))
    }
    if (cRes.ok) {
      const categories = (await cRes.json()) as ApiCategory[]
      categoryPages = categories.map((c) => ({
        url: `${SITE_URL}/shop?category=${c.slug}`,
        lastModified: new Date(),
        changeFrequency: 'weekly' as const,
        priority: 0.7,
      }))
    }
  } catch {
    // If the backend is down, fall back to static-only sitemap. This
    // ensures the route still returns 200 with valid XML.
  }

  return [...staticPages, ...categoryPages, ...productPages]
}
