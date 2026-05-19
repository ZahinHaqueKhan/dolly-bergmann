import { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/api/', '/admin/', '/account/'] },
    sitemap: 'https://modestwear.com/sitemap.xml',
  }
}