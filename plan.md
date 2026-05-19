# Ecommerce Website Plan — Modest Fashion Store (Dresses, Khimar/Headscarves)

## 1. Project Overview

**Name**: ModestWear Store
**Goal**: A fast, secure, SEO-optimized ecommerce platform for selling modest clothing (dresses, khimar/headscarves). Customers can browse, order, and pay. Admins can manage products via UI or JSON import. An AI chatbot (SAIA) answers customer questions.
**Target Audience**: Modest fashion shoppers, primarily mobile.

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15 (App Router, TypeScript, Tailwind CSS) |
| Backend | FastAPI (Python 3.12, async) |
| Database | PostgreSQL + SQLAlchemy (async) + Alembic migrations |
| Auth | JWT (access + refresh tokens), Argon2 password hashing |
| Payments | Stripe Checkout + Webhooks |
| File Storage | Local (configurable for S3) |
| AI Chatbot | SAIA API (`repos/saia-test`) |
| Admin UI | FastAPI Admin panel (built-in) or custom React admin |
| Caching | Redis (session cache, rate limiting) |
| SEO | next/font, next-sitemap, structured data (JSON-LD) |

---

## 3. Architecture

```
Frontend (Next.js)  <-- HTTPS -->  FastAPI Backend  <--> PostgreSQL
                                           |
                                      Stripe Webhooks
                                           |
                                     SAIA Chatbot API
```

- **Frontend**: Next.js SSR/SSG for product pages, ISR for category pages, API routes for cart/checkout.
- **Backend**: FastAPI app with routers for products, orders, payments, auth, admin, chatbot.
- **DB**: Async PostgreSQL with SQLAlchemy 2.0. Single source of truth for products, orders, customers.
- **Payment flow**: Stripe Checkout (hosted) → webhook confirms payment → order marked paid.

---

## 4. Features

### 4.1 Customer Features
- **Product catalog**: Browse by category (dresses, khimar), filter by size/color/price, search.
- **Product detail**: Multiple images, size selector, color variants, stock, descriptions, size guide.
- **Cart**: Persistent cart (localStorage + DB for logged-in users), quantity update, remove items.
- **Checkout**: Guest or account, address form, shipping method selection, tax calculation, discount codes.
- **Payment**: Stripe Checkout (redirect to Stripe, webhook confirms).
- **Order confirmation**: Email + on-screen confirmation with order summary.
- **Account**: Order history, track shipment status, save addresses.
- **Wishlist**: Save favorite products.

### 4.2 Admin Features
- **Dashboard**: Sales overview, recent orders, low-stock alerts.
- **Product management**: Create/edit/delete products, variants, categories, tags.
- **JSON bulk import**: Upload JSON file → validate schema → preview → confirm import. Shows row-level errors.
- **Order management**: View orders, update fulfillment status, issue refunds.
- **Inventory**: Stock levels, low-stock notifications.
- **Analytics**: Revenue charts, conversion metrics (basic).

### 4.3 AI Chatbot (SAIA)
- Embeddable widget on storefront.
- Answers FAQs: shipping times, return policy, size guidance, product questions.
- Authenticated users: can check order status.
- Guardrails: no PII in responses, rate limiting (10 req/min), prompt input sanitized.
- Logs unanswered questions for admin review.

### 4.4 SEO
- SSR product/category pages (indexable).
- JSON-LD structured data: `Product`, `Offer`, `BreadcrumbList`, `FAQPage`.
- Canonical URLs, dynamic `sitemap.xml`, `robots.txt`.
- Open Graph + Twitter Card meta tags per product.
- Core Web Vitals optimized (LCP < 2.5s, CLS < 0.1).
- Responsive images with `srcset`, WebP/AVIF.

---

## 5. Security

- **Auth**: Argon2 password hashing, JWT with short-lived access tokens (15min) + refresh tokens (7d).
- **Admin**: Separate role `admin`, all admin routes protected.
- **Payments**: Stripe webhook signature verification, never handle raw card data.
- **Input validation**: Pydantic models on all API endpoints, Zod on frontend.
- **Rate limiting**: Redis-backed, 100 req/min general, 10 req/min for auth endpoints.
- **CORS**: Strict origin whitelist.
- **Headers**: CSP, HSTS, X-Frame-Options, X-Content-Type-Options via middleware.
- **Audit log**: All admin actions logged (who, what, when).

---

## 6. Data Model

### Core Entities
- `User` — customer or admin
- `Address` — user addresses
- `Category` — e.g., "Dresses", "Khimar"
- `Product` — name, slug, description, images, SEO metadata
- `Variant` — size, color, SKU, price, stock
- `Order` — customer, address, status, total, Stripe payment ID
- `OrderItem` — product variant, quantity, unit price
- `Payment` — Stripe payment intent/refund records
- `Coupon` — code, discount type/amount, validity
- `CartItem` — user/guest cart
- `WishlistItem` — user wishlist
- `AuditLog` — admin action tracking
- `ChatbotLog` — unanswered question logging

### Relationships
```
User 1---M Address
User 1---M Order
User 1---M WishlistItem
Category 1---M Product
Product 1---M Variant
Product M---M Tag
Order 1---M OrderItem
Variant 1---M OrderItem
Coupon 1---M Order (optional)
```

---

## 7. API Endpoints

### Products
- `GET /api/products` — list with filters/pagination
- `GET /api/products/:slug` — detail
- `POST /api/products` — admin create
- `PUT /api/products/:id` — admin update
- `DELETE /api/products/:id` — admin delete

### Categories
- `GET /api/categories` — list
- `POST /api/categories` — admin create
- `PUT /api/categories/:id` — admin update

### Cart & Checkout
- `GET /api/cart` — get current cart
- `POST /api/cart/items` — add item
- `PUT /api/cart/items/:id` — update quantity
- `DELETE /api/cart/items/:id` — remove
- `POST /api/checkout` — create Stripe session, return URL
- `POST /api/webhooks/stripe` — Stripe webhook handler

### Orders
- `GET /api/orders` — list (auth required)
- `GET /api/orders/:id` — detail (auth required)
- `GET /api/admin/orders` — admin list
- `PUT /api/admin/orders/:id/status` — update status

### Auth
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `GET /api/auth/me`

### Admin
- `POST /api/admin/products/import` — JSON bulk import
- `GET /api/admin/import/:job_id` — import status + errors
- `GET /api/admin/dashboard` — stats

### Chatbot
- `POST /api/chatbot` — send message, returns SAIA response

---

## 8. Admin JSON Import Schema

```json
{
  "products": [
    {
      "name": "string (required)",
      "slug": "string (optional, auto-generated if omitted)",
      "description": "string (required)",
      "category": "string (category name, required)",
      "variants": [
        {
          "size": "string (required)",
          "color": "string (required)",
          "price": "number (required, in cents)",
          "stock": "integer (required)",
          "sku": "string (optional)",
          "images": ["url1", "url2"]
        }
      ],
      "tags": ["string"]
    }
  ]
}
```

Validation:
- Required fields checked.
- Slug uniqueness checked.
- Category auto-created if not exists.
- Returns preview + row-level errors before confirm.

---

## 9. Suggested Extra Features

1. **Size Guide**: Interactive size chart per product category with body measurement input.
2. **Reviews & Q&A**: Product reviews with star ratings; customer Q&A on product pages.
3. **Abandoned Cart Recovery**: Email reminder for guest carts (via cron job).
4. **Related Products**: "You may also like" section based on category/tags.
5. **REST API docs**: Auto-generated Swagger UI at `/docs`.
6. **Email notifications**: Order confirmation, shipping update, low stock alerts.
7. **Discount campaigns**: Seasonal banners, bundle deals.
8. **Analytics dashboard**: Revenue over time, top products, conversion funnel.

---

## 10. Implementation Phases

### Phase 1 — Foundation
- [ ] Project scaffolding: Next.js frontend, FastAPI backend, PostgreSQL.
- [ ] DB schema + migrations.
- [ ] Auth system (register, login, JWT).
- [ ] Basic admin product CRUD.

### Phase 2 — Catalog & SEO
- [ ] Product listing pages (category, filters, pagination).
- [ ] Product detail pages with variants.
- [ ] Structured data (JSON-LD).
- [ ] Sitemap + robots.txt.

### Phase 3 — Cart & Checkout
- [ ] Cart logic (add/update/remove).
- [ ] Stripe Checkout integration.
- [ ] Webhook handler + order creation.
- [ ] Order confirmation emails.

### Phase 4 — Admin & Import
- [ ] Admin dashboard.
- [ ] Full product/variant management UI.
- [ ] JSON bulk import with validation + preview.

### Phase 5 — AI Chatbot
- [ ] SAIA API integration.
- [ ] Chatbot widget on storefront.
- [ ] FAQ knowledge base.
- [ ] Rate limiting + guardrails.

### Phase 6 — Polish
- [ ] Performance optimization (images, caching).
- [ ] Security hardening.
- [ ] Mobile UX pass.
- [ ] Email templates.

### Phase 7 — Launch
- [ ] QA + testing.
- [ ] Deployment setup.
- [ ] Monitoring + logging.

---

## 11. Configuration

Environment variables (`.env`):
```
# Database
DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/modb

# Auth
JWT_SECRET=<secret>
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=15
REFRESH_TOKEN_EXPIRE_DAYS=7

# Stripe
STRIPE_PUBLIC_KEY=<key>
STRIPE_SECRET_KEY=<key>
STRIPE_WEBHOOK_SECRET=<secret>

# SAIA
SAIA_API_URL=<url>
SAIA_API_KEY=<key>

# App
FRONTEND_URL=http://localhost:3000
BACKEND_URL=http://localhost:8000
REDIS_URL=redis://localhost:6379
```

---

## 12. Open Questions

1. **SAIA repo location** — `repos/saia-test` not found under current workspace. Please confirm the path to inspect SAIA API spec.
2. **Shipping providers** — Which carrier(s) for real-time rate calculation?
3. **Multi-currency** — Support multiple currencies or single (USD/EUR/GBP)?
4. **Email service** — Provider preference (SendGrid, AWS SES, Resend)?