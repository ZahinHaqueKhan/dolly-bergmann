---
name: nextjs-app-router-page
description: Use when creating, modifying, or debugging any page or route in the ModestWear Next.js 15 frontend. Triggers on app/**/page.tsx, layout.tsx, route.ts, server components, client components, metadata, or any frontend code under frontend/app/.
---

# Next.js App Router Page Skill

## CRITICAL: Read this first

`frontend/AGENTS.md` warns: **"This is NOT the Next.js you know."** Before writing any code, read the relevant guide in `node_modules/next/dist/docs/`. Conventions in training data may be wrong for this version.

## When to use this skill
- Adding a new page under `frontend/app/`
- Editing existing pages (`/`, `/shop`, `/product/[slug]`, `/cart`, `/checkout`, `/account`, `/admin`, etc.)
- Creating server components, client components, or route handlers
- Adding SEO metadata (title, description, OpenGraph, JSON-LD)
- Implementing data fetching (RSC, `fetch`, `cache`, ISR)
- Adding `loading.tsx` / `error.tsx` / `not-found.tsx` boundaries

## Server vs client components (default rule)

**Default: server component.** Only add `'use client'` when you need:
- `useState`, `useEffect`, `useRef`, `useReducer`
- Event handlers (`onClick`, `onChange`, `onSubmit`)
- Browser APIs (`window`, `localStorage`, `IntersectionObserver`)
- Zustand, React Context with state

The current `frontend/app/admin/page.tsx` is a client component **only because of `useState`** (which is unnecessary — state is never updated). Remove `'use client'` there.

## File conventions

```
app/
├── layout.tsx              # Root layout (Header, Footer, ChatbotWidget)
├── page.tsx                # Homepage (/)
├── not-found.tsx           # 404
├── loading.tsx             # Global loading
├── error.tsx               # Global error boundary (must be 'use client')
├── globals.css
├── shop/
│   └── page.tsx            # /shop
├── product/[slug]/
│   └── page.tsx            # /product/foo  (server component, params.slug)
├── cart/page.tsx
├── checkout/page.tsx
├── account/
│   ├── page.tsx
│   └── orders/page.tsx
├── admin/
│   ├── page.tsx
│   ├── products/page.tsx
│   ├── products/new/page.tsx
│   ├── orders/page.tsx
│   ├── import/page.tsx
│   └── coupons/page.tsx
└── api/
    └── chatbot/route.ts    # POST handler
```

## Data fetching

**Server components (preferred):**

```tsx
async function getProduct(slug: string) {
  const res = await fetch(`${process.env.BACKEND_URL}/api/products/${slug}`, {
    next: { revalidate: 60 },  // ISR: revalidate every 60s
  });
  if (!res.ok) notFound();
  return res.json();
}

export default async function ProductPage({ params }: { params: { slug: string } }) {
  const product = await getProduct(params.slug);
  return <div>...</div>;
}
```

**Client components** (cart, checkout forms):

```tsx
'use client';
import useSWR from 'swr';  // or zustand store
```

**`fetch` in server components does NOT need `cache: 'no-store'`** for fast-changing data — use `next: { revalidate: 0 }` instead. Verify the actual API in the local Next.js docs.

## Metadata (SEO)

Each page must export `metadata` (static) or `generateMetadata` (dynamic):

```tsx
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Shop Modest Fashion — ModestWear',
  description: 'Dresses, khimar, abayas...',
  openGraph: {
    title: '...',
    description: '...',
    images: ['/og-default.png'],
  },
};

// Dynamic:
export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const product = await getProduct(params.slug);
  return {
    title: `${product.name} — ModestWear`,
    description: product.description.slice(0, 160),
    openGraph: { images: product.images[0] },
  };
}
```

## JSON-LD structured data

The plan calls for `Product`, `Offer`, `BreadcrumbList`, `FAQPage` schema. Add via a `<script type="application/ld+json">` in the page. **Server component only:**

```tsx
export default async function ProductPage({ params }) {
  const product = await getProduct(params.slug);
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    image: product.images,
    description: product.description,
    offers: {
      '@type': 'Offer',
      priceCurrency: 'USD',
      price: product.variants[0].price / 100,
      availability: product.variants.some(v => v.stock > 0)
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
    },
  };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <main>...</main>
    </>
  );
}
```

## Existing pages and gaps

| Page | Status | Action |
|---|---|---|
| `/` | Real (renders Header/Footer) | OK |
| `/shop` | Real | OK |
| `/product/[slug]` | SSR + JSON-LD | OK, verify metadata |
| `/cart` | Uses Zustand | Wire to `/api/cart` for logged-in users |
| `/checkout` | Real | Wire to `/api/checkout` |
| `/account` | Real | Add login/register forms, order history |
| `/admin` | **MOCK DATA** | Replace with real `/api/admin/dashboard` |
| `/admin/products` | Missing | Build list with filters, link to /new |
| `/admin/products/new` | Missing | Build form |
| `/admin/orders` | Missing | Build table + status update |
| `/admin/import` | Missing | Build JSON upload + preview/confirm UI |
| `/admin/coupons` | Missing | Build CRUD |
| `/api/chatbot/route.ts` | Exists | Verify it consumes backend correctly |

## Cart store integration

`frontend/store/cart.ts` uses Zustand with `persist` middleware (localStorage). To sync with backend for logged-in users:

```tsx
// On login:
const syncCartToBackend = async (token: string, items: CartItem[]) => {
  for (const item of items) {
    await fetch(`${API}/api/cart/items`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ variant_id: item.variantId, quantity: item.quantity }),
    });
  }
};
```

For guest checkout, the backend tracks cart by `X-Session-Id` header. Generate a UUID on first cart add and persist it like the cart itself.

## Image handling

The plan calls for `srcset`, WebP/AVIF, lazy loading. Use `next/image`:

```tsx
import Image from 'next/image';
<Image
  src={product.images[0]}
  alt={product.name}
  width={800}
  height={1000}
  sizes="(max-width: 768px) 100vw, 50vw"
  priority={false}  // true only for LCP image
/>
```

Configure `next.config.ts` with the backend image domain.

## Things to never do

- Never use `getServerSideProps` / `getStaticProps` — App Router uses `fetch` + `generateMetadata`.
- Never import from `next/router` — use `next/navigation` instead.
- Never put `'use client'` at the top of a layout or page that doesn't need interactivity.
- Never use `<img>` directly — use `next/image`.
- Never use `<a>` for internal navigation — use `next/link`.
- Never inline a 500-line client component. Split: server page + small client islands.
- Never call the backend URL in client-side code without a public env var. The browser should call `/api/...` proxy routes, not the FastAPI host directly (CORS).
