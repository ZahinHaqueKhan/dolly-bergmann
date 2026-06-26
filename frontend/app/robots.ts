import { MetadataRoute } from 'next'

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || 'https://modestwear.com'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Disallow: API routes, B2B portal, admin, authenticated
        // account areas, and chat widget. Everything else is B2C and
        // indexable.
        disallow: [
          '/api/',
          '/admin/',
          '/account/',
          '/wholesale/',
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
