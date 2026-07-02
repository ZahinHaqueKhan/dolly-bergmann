# ModestWear — Development Plan (v2)

**Status:** Active plan
**Last updated:** 2026-06-25
**Project:** Online clothing shop for a single modest-fashion business (ModestWear)
**Primary surface:** B2C store at `/`
**Secondary surface:** B2B wholesale portal at `/wholesale` (gated, request-a-quote)

---

## 0. Project recap

**Stack:** Next.js 15 (App Router) + FastAPI + PostgreSQL + Stripe + SAIA chatbot + Redis
**Repo state:** Backend 80% scaffolded (12 models, 9 routers, no migrations); Frontend 60% (real shop/product pages, mock admin, no real auth flow)
**Existing artifacts:** `plan.md` (v1, deprecated), `README.md`, `sample_products.json`, `run.sh`, Dockerfiles, 7 project skills, `opencode.json`

**This plan is the canonical source going forward.** It assumes the existing repo, models, and skills. Phases 1–3 are largely unblocking what's already coded; Phases 4–7 are net-new; Phase 4.5 is the B2B portal.

---

## 1. Refined product scope

### In scope (MVP → v1)

**B2C (primary, 80% of effort):**
- Catalog: dresses, khimar, abayas, accessories
- Cart: guest (session-id) + authenticated
- Checkout: Stripe Checkout (hosted)
- Order history (customer) + management (admin)
- Auth: email + password, JWT
- Admin: product CRUD, JSON bulk import, order mgmt, dashboard
- AI chatbot: SAIA-powered FAQ + order status for logged-in users
- SEO: SSR product pages, JSON-LD, sitemap, robots, OG
- Mobile-responsive, accessible (WCAG AA)

**B2B (secondary, 20% of effort):**
- B2B signup with business fields
- Admin manual approval queue
- Wholesale catalog (shared B2C catalog, no retail prices)
- Quote request flow (cart-style RFQ + CSV upload)
- Admin quote builder (set unit prices, send PDF)
- B2B accepts/declines quote
- Manual invoice + offline payment (admin marks paid)
- B2B order tracking (status timeline, no Stripe)

### Out of scope (v1, deferred)
- Multi-currency / multi-language (i18n deferred to v1.1)
- Subscriptions / pre-orders
- Native mobile app
- Marketplace / multi-vendor
- Loyalty / rewards points
- Live chat with human sales rep
- B2B tiered pricing (admin sets prices per quote)
- B2B automated Net-30 / Net-60 terms (manual for v1)
- B2B punchout (cXML/OCI) integrations
- B2B per-buyer custom catalogs
- B2B self-service credit application
- B2B quick-order grid (CSV upload covers the use case)

---

## 2. Roles & permissions

| Role | Auth | Can do |
|---|---|---|
| **Guest (B2C)** | None | Browse, search, view products, add to cart (session), checkout, ask chatbot |
| **Customer (B2C)** | JWT | + order history, saved addresses, wishlist, faster checkout |
| **Wholesale applicant (B2B)** | JWT, role=wholesale, status=pending | View "Application under review" page only |
| **Wholesale buyer (B2B)** | JWT, role=wholesale, status=approved | View wholesale catalog, build RFQ, view quotes/orders |
| **Admin** | JWT, role=admin | Everything above + product CRUD, JSON import, order mgmt, B2B application/quote approval, dashboard, refund, low-stock alerts, chatbot logs |

Enforcement: `get_current_user` dependency on every protected route; `get_current_admin_user` for `/api/admin/*`; `get_current_approved_wholesale` for `/api/wholesale/*`. All in `backend/app/auth/service.py`.

---

## 3. Data model (final)

The 12 existing models cover the B2C foundation. Additions and refinements for v1:

### Add
- `ImportJob` — replaces in-memory `import_jobs` dict (Phase 4.4)
- `EmailLog` — track sent emails for debugging (sender, recipient, template, status, error)
- `RefreshToken` — store hashed refresh tokens (rotated on each refresh, revoked on logout)
- `WholesaleApplication` — B2B signup → approval workflow
- `Quote` — RFQ lifecycle (submitted → sent → accepted/declined/expired)
- `QuoteLineItem` — line items in a quote (admin-priced)
- `WholesaleOrder` — post-acceptance order (status, payment, shipping)

### Modify (existing models)
- `User`: add `role` enum string (`customer`|`wholesale`|`admin`), `company_name`, `tax_id`, `approved_at`, `is_active` for soft-disable
- `Order.shipping_address`: JSONB (already) — **must be populated from Stripe** (currently `{}` — bug)
- `Order.stripe_payment_intent_id`: unique index
- `Variant.images`: ensure JSONB
- `Coupon`: add `starts_at`, `ends_at` for time-bounded campaigns
- `AuditLog`: add `ip_address` and `user_agent`
- `Product`: add `b2b_only` boolean (hidden from B2C if true), `b2b_min_order_qty` integer (default 1)

### Keep
- All other models as-is

### Relationships (B2C + B2B)
```
User 1---M Address, Order, RefreshToken, WishlistItem, AuditLog, EmailLog
User 1---1 WholesaleApplication (when role=wholesale)
User 1---M Quote, WholesaleOrder
Category 1---M Product
Product 1---M Variant
Product M---M Tag (via JSON array on Product.tags for v1)
Variant 1---M OrderItem, CartItem, QuoteLineItem
Order 1---M OrderItem
Order 1---1 Payment
Coupon 1---M Order
ImportJob M---1 User (admin)
Quote 1---M QuoteLineItem
Quote 1---1 WholesaleOrder (after acceptance)
```

---

## 4. Tech stack — pinned

| Layer | Choice | Notes |
|---|---|---|
| Frontend | Next.js 15 (App Router, RSC, TypeScript, Tailwind v4) | Skill: `nextjs-app-router-page` |
| Backend | FastAPI 0.115+ (Python 3.12, async) | |
| ORM | SQLAlchemy 2.0 (async) + Alembic | Skill: `alembic-migration` |
| DB | PostgreSQL 16 | JSONB for `tags`, `images`, `shipping_address`, `Quote.line_items` |
| Auth | JWT (access 15min, refresh 7d), Argon2 | httpOnly cookies, SameSite=Lax |
| Payments (B2C) | Stripe Checkout + Webhooks | Skill: `stripe-checkout-flow` |
| Payments (B2B) | Offline (invoice, wire, check) — admin marks paid manually | No Stripe for B2B in v1 |
| Cache / rate limit | Redis 7 | Plan called for it; currently in-memory (gap) |
| File storage | Local `/var/www/modestwear/uploads/` for v1; S3-compatible later | |
| AI Chatbot | SAIA (OpenAI-compatible) | Skill: `saia-chatbot-prompt` |
| Email | Resend (recommended) or AWS SES | |
| PDF generation | WeasyPrint (HTML→PDF for quotes) | Pure Python, no system deps beyond cairo |
| Frontend hosting | Vercel (recommended) or Docker on VPS | |
| Backend hosting | Fly.io / Railway / Render (managed) or Docker on VPS | |
| Observability | Sentry (errors), Plausible or Umami (analytics) | v1.1 |

---

## 5. Implementation phases (gantt-ordered)

### Phase 1 — Foundation & unblock (Week 1)

**Goal:** Get a runnable dev environment with a real database.

#### 1.1. Generate baseline Alembic migration
Use the `alembic-migration` skill. Procedure:
- Ensure `backend/alembic/env.py` is configured for async with `asyncpg` (template in skill)
- 12 existing models → one migration file: `alembic revision --autogenerate -m "baseline: 12 models"`
- **Review the generated file** for these autogenerate gotchas:
  - Enums: hand-check any value changes
  - `server_default=func.now()` renders correctly
  - `unique=True` indexes on `Product.slug`, `User.email`, `Variant.sku` (and `Order.stripe_payment_intent_id` after Phase 3)
  - JSONB columns (`Product.tags`, `Order.shipping_address`, `Variant.images`) — use `postgresql.JSONB`
  - `Numeric` for prices — never `Float`
- Run `alembic upgrade head` and verify all 12 tables exist
- Run `alembic downgrade base` for clean rollback
- Commit the baseline file

#### 1.2. Set up local dev env (end-to-end)
- `docker compose up -d` brings up Postgres + Redis + backend + frontend
- `run.sh dev-tmux` works without Docker
- Verify all 4 services healthy via healthchecks
- Document any quirks in `README.md` "Setup" section

#### 1.3. Seeding script (`backend/scripts/seed.py`)
- Reads `sample_products.json`
- Creates 2 categories: `Dresses`, `Khimar`
- Creates 1 admin user from `ADMIN_EMAIL` / `ADMIN_PASSWORD` env (fail loudly if not set)
- Creates ~10 sample products with variants
- Idempotent: `python seed.py --reset` truncates + re-seeds
- Output: prints summary (N products, M variants created)

#### 1.4. Backend skeleton healthcheck (`GET /api/health`)
- Returns: `{db: ok|error, redis: ok|error|missing, stripe: ok|missing, saia: ok|missing}`
- Used by Docker healthcheck and load balancers
- Does NOT return 500 on missing optional services — return `ok: missing` instead

**Exit criteria:**
- [ ] Fresh clone → `docker compose up` → can hit `/api/health` (200 with `db: ok`)
- [ ] `/api/products` returns seeded data
- [ ] `http://localhost:3000/shop` renders products

---

### Phase 2 — Auth & accounts (Week 2)

**Goal:** Customers can register, log in, and persist state.

#### 2.1. `/api/auth/register`
- Pydantic validation: email format, password ≥ 8 chars (uppercase + lowercase + digit), name required
- Argon2 hash, store in `User` with `role="customer"`
- Return access (15min) + refresh (7d) tokens
- Send welcome email via Resend (template: `welcome.html`)
- Rate limit: 5 attempts per IP per 5 min via Redis

#### 2.2. `/api/auth/login`
- Verify password (constant-time Argon2 check)
- Issue access + refresh tokens
- Refresh stored as hashed `RefreshToken` row with `expires_at`
- Rate limit: 5 attempts per IP per 5 min

#### 2.3. `/api/auth/refresh`
- Validate refresh token, **rotate** (delete old, issue new)
- Detect reuse → revoke entire token family (security best practice)

#### 2.4. `/api/auth/me` + `/api/auth/logout`
- `me` returns current user
- `logout` revokes refresh token (mark `revoked_at` in DB)

#### 2.5. Frontend auth flow
- `/account/login`, `/account/register` pages
- Zustand `useAuthStore` (separate from `useCartStore`)
- Token in **httpOnly cookie** (not localStorage) — XSS-safe
- `Set-Cookie: access_token=...; HttpOnly; Secure; SameSite=Lax`
- Auto-refresh on 401 via `fetch` wrapper in `lib/api.ts`
- Header shows "Sign in" or user menu (orders, wishlist, logout)

#### 2.6. Wishlist UI
- Heart icon on `ProductCard` and product detail page
- `GET /api/wishlist`, `POST /api/wishlist`, `DELETE /api/wishlist/:product_id`
- `/account/wishlist` page with grid of saved products

**Exit criteria:**
- [ ] User can register, log in, log out
- [ ] Refresh page and stay logged in
- [ ] Header shows user name
- [ ] Add/remove wishlist item persists across sessions

---

### Phase 3 — Cart, checkout, payments (Weeks 3–4)

**Goal:** End-to-end purchase works with real money (test mode).

#### 3.1. Cart state — hybrid (localStorage + server)
- Anonymous: Zustand `useCartStore` (localStorage) + generated `session_id` (UUID) sent as `X-Session-Id` header
- Logged-in: synced to `CartItem` table on each add/update/remove
- On login: merge guest cart into user cart (server is source of truth; newer quantities win on conflict)

#### 3.2. Cart endpoints
- `GET /api/cart` (user or session)
- `POST /api/cart/items` `{variant_id, quantity}`
- `PUT /api/cart/items/:id` `{quantity}` (0 = remove)
- `DELETE /api/cart/items/:id`
- All validate stock in real-time; reject if `quantity > variant.stock`

#### 3.3. Checkout page (`/checkout`)
- Cart summary with line items, subtotal
- Address form (saved addresses selectable for logged-in users)
- Optional coupon code field
- Shipping method: free over $100, otherwise flat $7 (v1; defer real-time carrier rates)
- "Place Order" button → calls `/api/checkout` → redirects to Stripe

#### 3.4. `/api/checkout` (use `stripe-checkout-flow` skill)
- Idempotency key = `sha256(cart_signature + user_id_or_session_id)`
- `line_items` from current cart (price in cents, currency="usd")
- `shipping_address_collection: {allowed_countries: ["US", "CA", "GB", "DE", "FR", "AU"]}`
- `metadata: {user_id, session_id, cart_signature}` (NO PII)
- **Apply coupon via local calc** (not Stripe `discounts[]`) — single source of truth
- `success_url` → `{FRONTEND_URL}/order/success?session_id={CHECKOUT_SESSION_ID}`
- `cancel_url` → `{FRONTEND_URL}/cart`
- Return `{checkout_url, session_id, total}`

#### 3.5. `/api/webhooks/stripe` (use `stripe-checkout-flow` skill)
- Verify signature with `STRIPE_WEBHOOK_SECRET` (raw body, NOT `request.json()`)
- On `checkout.session.completed`:
  1. `stripe.checkout.Session.retrieve(id, expand=["shipping_details", "line_items", "customer_details"])`
  2. Begin DB transaction
  3. Upsert `Order` on `stripe_payment_intent_id` (unique index) — idempotent
  4. **Populate `shipping_address` from `session.shipping_details.address`** (fix current `{}` bug)
  5. Create `OrderItem` rows from line items
  6. `select(Variant).where(...).with_for_update()` → decrement stock (prevents overselling race)
  7. Delete cart items
  8. Send order confirmation email (Resend, `order_confirmation.html`)
  9. Commit
- On `payment_intent.payment_failed`: mark order `cancelled`
- Webhook is **outside** rate limiter, **does not** require auth (Stripe signs for it)
- **Add `Order.stripe_payment_intent_id` unique index** via migration

#### 3.6. `/order/success?session_id=...` page
- Server component fetches order by Stripe session_id (with auth check — only owner or admin)
- Shows order summary, expected delivery range, account link
- Handles "session not found yet" with a loading state (webhook may be delayed)

#### 3.7. `/account/orders` + `/account/orders/[id]`
- List: status, total, date, item count
- Detail: line items, shipping address, status timeline, tracking (when available)

#### 3.8. Stripe CLI in dev
- Document in `README.md`: `stripe listen --forward-to localhost:8000/api/webhooks/stripe`
- Test card: `4242 4242 4242 4242`, any future date, any CVC
- Test declined: `4000 0000 0000 0002`

**Exit criteria:**
- [ ] Anonymous user can buy a product with `4242 4242 4242 4242`
- [ ] Order appears in their account after registration
- [ ] Order visible via `?session_id=` lookup
- [ ] Confirmation email lands in inbox (Resend test mode)
- [ ] Stock decremented correctly
- [ ] Cannot buy a variant at zero stock (UI shows "Out of stock")
- [ ] Stripe CLI forwards webhooks in dev

---

### Phase 4 — Admin: products, import, orders (Weeks 5–6)

**Goal:** Store owner can run the shop without a developer.

#### 4.1. Admin layout & auth gate
- `/admin/*` requires `role="admin"`
- Server-side redirect if not admin
- Admin sidebar nav: Dashboard, Products, Orders, Import, Coupons, Chatbot Logs, Settings

#### 4.2. Replace mock `/admin` page with real dashboard
- `GET /api/admin/dashboard` exists — wire frontend to it
- Remove `MOCK_STATS` and `MOCK_RECENT_ORDERS` from `frontend/app/admin/page.tsx`
- Display: total products, total orders, total revenue, low stock, recent orders
- Use `tailwind-design-system` skill for card/table patterns

#### 4.3. Products management
- `/admin/products` — paginated table (20 per page) with search, category filter
- `/admin/products/new` — form: name, slug, description, category, tags, variants
- `/admin/products/[id]/edit` — same form, pre-filled
- `POST /api/products`, `PUT /api/products/:id`, `DELETE /api/products/:id` (admin only)
- Image upload to local storage (`/uploads/products/`), URL stored in `Variant.images`
- Bulk actions: delete multiple, toggle active/inactive

#### 4.4. JSON bulk import (use `json-import-validator` skill)
- Add `ImportJob` model + migration
- Refactor `/api/admin/products/import/preview` to **persist ImportJob and return `job_id`** (current bug: in-memory only)
- `/api/admin/products/import/confirm {job_id}` uses persisted job
- Add schema versioning (`schema_version: 1`)
- Add dry-run diff (would_create vs would_update counts)
- Add validation rules: slug format `^[a-z0-9-]+$`, price 1-1000000, stock 0-100000, SKU format, max 50 variants/product
- `/admin/import` page: dropzone → preview table → confirm → progress polling
- Replace in-memory `import_jobs` dict entirely (data loss bug)

#### 4.5. Order management
- `/admin/orders` — table with filters (status, date range, search by email/order ID)
- `/admin/orders/[id]` — full detail, line items, shipping, status timeline
- `PUT /api/admin/orders/:id/status` — update fulfillment status
- `POST /api/admin/orders/:id/refund` — Stripe refund
- Send shipping update email on status change

#### 4.6. Coupons
- `/admin/coupons` — CRUD
- Coupon types: percent, fixed_amount, free_shipping
- Validity window (`starts_at`, `ends_at`), usage limit, per-user limit, min order value
- `GET/POST/PUT/DELETE /api/admin/coupons`
- Apply at checkout: local calc in `/api/checkout` (NOT Stripe discounts)

#### 4.7. Chatbot log review (use `saia-chatbot-prompt` skill)
- Add `resolved_at` column to `ChatbotLog` (migration)
- `GET /api/admin/chatbot/unanswered` — errored + refusal-flagged logs
- `/admin/chatbot` page: paginated list, click to see prompt + response
- "Mark as resolved" action

**Exit criteria:**
- [ ] Store owner can add a product via the UI
- [ ] Import 10 products from JSON works end-to-end
- [ ] View orders, mark one as shipped
- [ ] Create a coupon, apply it at checkout, verify discount
- [ ] Review chatbot failures, mark one as resolved

---

### Phase 4.5 — B2B Wholesale Portal (Weeks 6.5–9, partly parallel with Phase 5)

**Goal:** Wholesale buyers can self-serve quote requests, reducing admin email back-and-forth.

> **B2C-first principle:** B2B reuses B2C catalog, components, and infrastructure. No separate design system, no separate brand voice, no Stripe for B2B. Admin B2B work is one tab in the existing admin layout, not a separate app.

#### 4.5.1. Data model additions
- Add `WholesaleApplication` model (signup → approval)
- Add `Quote` + `QuoteLineItem` models
- Add `WholesaleOrder` model
- Add fields to `User`: `role`, `company_name`, `tax_id`, `approved_at`
- Add fields to `Product`: `b2b_only` (boolean), `b2b_min_order_qty` (integer, default 1)
- Generate migration (uses `alembic-migration` skill)

#### 4.5.2. Auth: wholesale signup + approval
- `/api/wholesale/signup` — collects business fields (company, tax ID, country, phone, website, notes)
- Creates `User` with `role="wholesale"`, `WholesaleApplication` with `status="pending"`
- Email to admin: "New wholesale application"
- Auto-login redirect to `/wholesale/pending` (shows status)
- `/api/auth/...` extended to support wholesale role
- Admin approval at `/admin/wholesale/applications`
  - Review company info, tax ID, notes
  - Approve / reject / request more info
  - On approve: set `User.approved_at`, email user "You're approved"
  - On reject: set `WholesaleApplication.rejection_reason`, email user

#### 4.5.3. B2B catalog view
- `/wholesale` (server component, auth + approved)
- Lists all products except `b2b_only=false` (those with `b2b_only=true` are B2B-only; both types shown to B2B)
- **No prices shown anywhere** — replace price with "Request quote" badge
- Add-to-quote button (variant selector: size, color, quantity)
- Uses existing `ProductCard` component (skill: `tailwind-design-system`)
- Meta: `noindex, nofollow` on all `/wholesale/*` pages

#### 4.5.4. Quote request flow
- `/wholesale/quote/new` — build RFQ
  - Option A: cart-style (add items from catalog, set quantities)
  - Option B: CSV upload (paste SKU + quantity lines, parse client-side)
  - Both routes converge to the same `Quote` submission
- `/wholesale/quotes` — list of submitted quotes (status: submitted, sent, accepted, declined, expired)
- `/wholesale/quotes/[id]` — view one quote, download PDF
- `POST /api/wholesale/quotes` — create new RFQ
- Rate limit: 5 quote submissions per user per day

#### 4.5.5. Admin quote builder
- `/admin/wholesale/quotes` — list of all quotes
- `/admin/wholesale/quotes/[id]` — review RFQ, set unit prices per line item
- Add shipping cost, tax (manual override), notes, valid_until
- "Send quote" button: generates PDF via WeasyPrint, emails to user, marks `status="sent"`
- Quote PDF template: HTML rendered with order details, valid for 30 days

#### 4.5.6. B2B accept/decline
- User receives email with PDF
- Opens `/wholesale/quotes/[id]`, sees the priced quote
- Buttons: "Accept quote" / "Decline quote"
- `POST /api/wholesale/quotes/:id/accept` → creates `WholesaleOrder` with `status="awaiting_payment"`, `payment_status="pending"`
- `POST /api/wholesale/quotes/:id/decline` → marks quote `declined`

#### 4.5.7. Invoice + offline payment
- Admin sends invoice PDF via email (outside the system for v1; later: stored in `/admin/wholesale/orders/[id]`)
- Admin manually marks `payment_status="paid"` when wire/check arrives
- Updates `paid_at` timestamp
- Email user "Payment received"

#### 4.5.8. Order tracking
- Admin updates `WholesaleOrder.status`: `awaiting_payment` → `paid` → `processing` → `shipped` → `delivered`
- Admin adds tracking number on `shipped`
- User sees status + tracking in `/wholesale/orders/[id]`
- Status timeline component (used in both B2C and B2B orders)

#### 4.5.9. B2B FAQ branch in chatbot
- Extend `saia-chatbot-prompt` skill: add `wholesale_faq.v1.md` addendum
- Loaded when `token_data.role == "wholesale"` and `status == "approved"`
- Topics: how to apply, MOQ, payment terms (Net-30 manual), shipping, lead times, custom orders

**Exit criteria:**
- [ ] Wholesale buyer can apply, get approved, log in, browse catalog
- [ ] Buyer can build RFQ via cart OR CSV upload
- [ ] Admin receives notification, builds quote, sends PDF
- [ ] Buyer accepts quote → order created
- [ ] Admin marks paid, updates status, adds tracking
- [ ] Buyer sees status updates in `/wholesale/orders`

**Effort:** ~3.5 weeks. Mostly in parallel with Phase 5 (chatbot) since they touch different files.

---

### Phase 5 — AI chatbot: SAIA integration (Week 7)

**Goal:** Customer-facing chatbot that actually helps, with guardrails. B2B FAQ branch added in 4.5.9.

#### 5.1. Prompt externalization (use `saia-chatbot-prompt` skill)
- Move prompt from hardcoded string in `backend/app/routers/chatbot.py` to `backend/app/prompts/`
- Split into files:
  - `system_base.md` (tone, safety rules)
  - `product_faq.v1.md` (current prompt, versioned)
  - `store_policies.md` (shipping, returns, sizing)
  - `wholesale_faq.v1.md` (B2B addendum, loaded for approved wholesale users)
  - `seasonal/ramadan.md` (loaded Mar–Apr)
  - `seasonal/eid.md` (loaded during Eid)
- Loader concatenates at request time
- Log prompt version in `ChatbotLog` for A/B analysis

#### 5.2. Guardrails
- PII regex strip on input:
  - Credit card: `\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b`
  - SSN: `\b\d{3}-\d{2}-\d{4}\b`
  - Email: `\b\S+@\S+\.\S+\b`
  - Phone: configurable
- Truncate input at 500 chars (already implemented)
- Refusal detection on response → flag in `ChatbotLog` (look for "I can't" / "I don't have access")
- Block order-management intents (refund, cancel order) → prepend system note directing to support

#### 5.3. Authenticated order-status lookup
- Detect keywords in user message: `my order`, `where is`, `tracking`, `order status`
- If detected AND user is authenticated:
  - Fetch last 3 orders for user (B2C) or wholesale orders (B2B)
  - Inject as context: "Recent orders: #1234 status=shipped total=$45.00"
- System prompt explicitly authorizes "status only, no PII"

#### 5.4. Redis-backed rate limiting
- Replace in-memory dict with `redis.incr` + `expire`
- 10 req/min per IP for anonymous
- 30 req/min per authenticated user
- Plan called this out — current in-memory is a v1.0 gap (data loss on restart, no multi-worker)

#### 5.5. Chatbot widget (`frontend/components/ChatbotWidget.tsx`)
- Floating bottom-right button (existing component — verify and enhance)
- Slide-up panel on click
- Maintains `session_id`, persists history in localStorage (last 50 messages)
- Sends `POST /api/chatbot` (proxied via Next.js `/api/chatbot` route to add `session_id` header)
- Markdown rendering: `react-markdown` + `remark-gfm`
- Mobile: full-screen on viewports < 768px
- Accessibility: ARIA labels, focus trap, escape to close, `prefers-reduced-motion` respected

#### 5.6. FAQ knowledge base (v1: inline; v1.1: RAG with pgvector)
- Inline most-asked questions in `product_faq.v1.md`
- v1.1: embed FAQ, store in Postgres with `pgvector` extension, retrieve top-k

**Exit criteria:**
- [ ] Customer can ask "What's your return policy?" → accurate answer
- [ ] Logged-in customer asks "Where is my order?" → real status returned
- [ ] Logged-in B2B buyer asks "What's the MOQ?" → wholesale FAQ answer
- [ ] Rate limit triggers 429 after 11 rapid requests
- [ ] Failed calls show "Chatbot unavailable" instead of 500
- [ ] PII in test input is stripped before SAIA call

---

### Phase 6 — SEO, performance, polish (Week 10)

**Goal:** Lighthouse 90+ on all categories, indexable pages, fast. B2B pages excluded from SEO work.

#### 6.1. SSR product pages (verify, mostly done)
- `/product/[slug]` is server component, fetches with ISR (revalidate 60s)
- JSON-LD: `Product`, `Offer`, `BreadcrumbList`
- OpenGraph + Twitter Card metadata
- Canonical URL

#### 6.2. Category pages
- `/shop?category=dresses` — verify metadata, JSON-LD `ItemList`
- Add `/c/[category-slug]` clean URLs later if needed

#### 6.3. Sitemap & robots
- `app/sitemap.ts` — generate from DB (all B2C products, categories, static pages)
- `app/robots.ts` — allow B2C, disallow `/wholesale/*` and `/admin/*` and `/account/*`
- Submit to Google Search Console

#### 6.4. Performance
- `next/image` for all product images with `sizes` attribute
- Configure `next.config.ts` for backend image domain
- Lazy load below-fold
- Preload critical fonts (Playfair + Inter)
- Target LCP < 2.5s, CLS < 0.1, INP < 200ms

#### 6.5. Accessibility
- Color contrast audit (stone-on-stone combinations in design system)
- Keyboard navigation on cart, checkout, chatbot
- ARIA labels on all interactive elements
- Form errors announced via `aria-live`
- Test with axe-core, fix all critical issues

#### 6.6. 404, 500, empty states
- Branded `not-found.tsx` (exists — enhance with search + featured products)
- `error.tsx` boundaries per route
- Empty cart, empty wishlist, no search results, empty order history — each with helpful message + CTA

#### 6.7. Email templates
- Welcome, order confirmation, shipping update, password reset, refund processed
- B2B: application received, application approved, quote ready, payment received, order shipped
- HTML + plain text versions
- Store in `backend/app/templates/emails/`
- Use MJML or handwritten responsive HTML

**Exit criteria:**
- [ ] Lighthouse Performance 90+, Accessibility 95+, SEO 100, Best Practices 95+
- [ ] All product images load with srcset
- [ ] All forms keyboard-navigable
- [ ] Sitemap submitted to Google Search Console
- [ ] All 10+ email templates created and tested

---

### Phase 7 — Hardening & launch (Weeks 11–12)

**Goal:** Production-ready, monitored, deployable.

#### 7.1. Security headers (middleware in `main.py`)
- CSP: allow self + Stripe.js + SAIA + image domains
- HSTS: 1 year, includeSubDomains, preload
- X-Frame-Options: DENY
- X-Content-Type-Options: nosniff
- Referrer-Policy: strict-origin-when-cross-origin
- Permissions-Policy: camera=(), microphone=(), geolocation=()

#### 7.2. CORS (strict)
- Allowlist: `FRONTEND_URL` only
- No wildcard in production

#### 7.3. Audit logging
- All admin actions write `AuditLog` (who, what, when, ip, ua, before/after JSON)
- View in `/admin/audit` (v1.1)

#### 7.4. Error monitoring
- Sentry on backend (`sentry-sdk[fastapi]`) and frontend (`@sentry/nextjs`)
- Source maps uploaded on build
- Slack/email alerts on new error types

#### 7.5. Testing
- **Backend:** pytest + pytest-asyncio + httpx async client
  - Test each router
  - Test webhook signature verification (valid + invalid)
  - Test stock decrement race condition
  - Test JSON import preview + confirm
  - Test B2B approval flow
  - Test quote accept/decline
  - Coverage target: 80%+
- **Frontend:** vitest + React Testing Library for components; Playwright for e2e
  - E2E: register → buy product → see in orders
  - E2E: admin imports JSON → products appear
  - E2E: B2B applies → admin approves → buyer requests quote → admin sends → buyer accepts
- **CI:** GitHub Actions — lint + typecheck + test on every PR

#### 7.6. Production deployment
- **Frontend:** Vercel (recommended). Env: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_STRIPE_PUBLIC_KEY`
- **Backend:** Fly.io or Railway. Env: `DATABASE_URL`, `REDIS_URL`, `STRIPE_*`, `SAIA_*`, `RESEND_API_KEY`, `FRONTEND_URL`
- **Database:** Managed Postgres (Neon / Supabase / RDS) with point-in-time recovery
- **Redis:** Upstash or managed Redis on the platform
- **Migrations:** Run via release command in deployment (`alembic upgrade head`)
- **Custom domain:** `modestwear.com` + `api.modestwear.com` with DNS + TLS

#### 7.7. Documentation
- Update `README.md` with setup, env vars, deployment
- API docs auto-generated at `/docs` (FastAPI Swagger)
- Admin user guide (Markdown in `docs/admin.md`)
- B2B user guide (Markdown in `docs/wholesale.md`)
- Troubleshooting runbook

#### 7.8. Pre-launch checklist
- [ ] All P0 features working in production
- [ ] Real Stripe keys (live mode) configured
- [ ] Real SAIA API key configured
- [ ] Resend domain verified
- [ ] Sentry receiving test events
- [ ] Backup strategy verified (DB daily snapshots, 30-day retention)
- [ ] Privacy policy, terms of service, return policy published
- [ ] Cookie consent banner
- [ ] GDPR / CCPA compliance review
- [ ] Load test: 100 concurrent users can browse + checkout
- [ ] B2B smoke test: apply → approve → quote → accept → paid → shipped

**Exit criteria:**
- [ ] Production deploy is repeatable via GitHub Actions
- [ ] On-call runbook exists
- [ ] All P0 features in production (B2C + B2B)
- [ ] Lighthouse meets targets
- [ ] Zero P0 bugs in production
- [ ] < 1% error rate on `/api/checkout` and `/api/webhooks/stripe`

---

## 6. Cross-cutting features & details

### 6.1 Search
- v1: SQL `ILIKE` on `Product.name` and `Product.description`
- v1.1: Meilisearch or Postgres full-text search
- UI: `/shop?q=khimar` debounced (300ms) search bar in header

### 6.2 Filtering
- Category, size, color, price range, in-stock toggle
- URL-driven state: `?category=dresses&size=M&color=black&min=20&max=80`
- Shareable filter URLs

### 6.3 Reviews & Q&A (v1.1)
- `Review` model: user, product, rating 1-5, body, verified_purchase, created_at
- `Question` / `Answer` models
- Admin moderation queue
- Email admin on new review (optional)

### 6.4 Bulk import (refined)
- Schema versioned (v1, v2, ...)
- Two-step: preview → confirm (mandatory, persisted job)
- DB-backed `ImportJob` (not in-memory)
- Per-row error reporting
- Dry-run diff vs existing products (would_create vs would_update)
- Idempotent: same slug = update, not duplicate
- Chunked commits (every 50 products) for resilience

### 6.5 Wishlist
- Heart icon on `ProductCard` and product detail
- `GET /api/wishlist`, `POST /api/wishlist`, `DELETE /api/wishlist/:product_id`
- `/account/wishlist` page

### 6.6 Notifications
**B2C emails:**
- Welcome (after registration)
- Order confirmation (after Stripe webhook)
- Shipping update (admin status change)
- Refund processed
- Password reset

**B2B emails:**
- Application received (immediately after signup)
- Application approved / rejected (after admin review)
- Quote ready (with PDF attached)
- Payment received (after admin marks paid)
- Order shipped (with tracking)

**Admin emails:**
- New wholesale application (immediately)
- New RFQ submitted (immediately)
- Low-stock daily digest (cron job, morning)
- New refund request (immediately)

### 6.7 Discount campaigns
- Coupons (Phase 4.6)
- v1.1: Automatic discounts (e.g., 10% off Khimar during Ramadan)
- v1.1: Bundle deals

### 6.8 Analytics
- Privacy-friendly: Plausible or Umami (no cookies, GDPR-friendly)
- Track: page views, product views, add-to-cart, checkout start, purchase
- Ecommerce events: `view_item`, `add_to_cart`, `begin_checkout`, `purchase`
- Admin dashboard widget (top products, conversion rate)
- B2B events (deferred to v1.1)

### 6.9 Internationalization (i18n) — v1.1
- `next-intl` for EN + AR
- RTL support for Arabic
- Currency: USD only for v1

### 6.10 Multi-currency — v1.1
- Out of scope for v1; revisit after launch

---

## 7. Security checklist (production gate)

- [ ] All passwords Argon2-hashed
- [ ] JWT short-lived (15min access) + rotated refresh; refresh reuse revokes family
- [ ] Stripe webhook signature verified
- [ ] All admin routes require `role="admin"`
- [ ] All wholesale routes require `role="wholesale"` AND `approved_at IS NOT NULL`
- [ ] CORS allowlist (no `*`)
- [ ] Rate limiting: auth (5/5min), chatbot (10/min anon, 30/min auth), quote submit (5/day per user)
- [ ] CSP, HSTS, X-Frame-Options, X-Content-Type-Options headers
- [ ] PII stripped from chatbot prompts (regex)
- [ ] No secrets in repo; only `.env.example` with placeholders
- [ ] `.env` in `.gitignore`
- [ ] All user input validated (Pydantic on backend, Zod on frontend)
- [ ] SQL injection prevented (SQLAlchemy parameterizes)
- [ ] XSS prevented (React escapes; no `dangerouslySetInnerHTML` except JSON-LD)
- [ ] CSRF: not needed for JWT in httpOnly cookies + sameSite=lax
- [ ] Audit log on all admin actions
- [ ] Backup: daily DB snapshot, 30-day retention
- [ ] Dependency scanning: Dependabot or Renovate on GitHub
- [ ] Quote PDF download URLs expire (signed URLs, 24h TTL)

---

## 8. Infrastructure & cost (rough, for one business)

| Service | Tier | Cost/month |
|---|---|---|
| Vercel (frontend) | Hobby → Pro | $0–$20 |
| Fly.io (backend) | Free → $10 | $0–$10 |
| Neon (Postgres) | Free → Launch | $0–$19 |
| Upstash (Redis) | Free → Pay-as-go | $0–$5 |
| Resend (email) | Free (3k/mo) → $20 | $0–$20 |
| Stripe | Pay-as-you-go | 2.9% + 30¢ per txn (B2C only) |
| Sentry | Free (5k events) | $0 |
| Plausible | $9/mo (self-host free) | $0–$9 |
| Domain | Annual | $12/yr |
| **Total (low traffic)** | | **<$50/mo + Stripe fees** |
| **Total (moderate traffic, ~1k B2C orders/mo)** | | **~$150/mo + Stripe fees** |

B2B adds no infrastructure cost — uses the same backend, database, and email service.

---

## 9. Risks & mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Stripe webhook reliability | Lost orders | Idempotent upsert on `stripe_payment_intent_id`; Sentry alerts on webhook errors |
| Stock race conditions | Overselling | `SELECT ... FOR UPDATE` on `Variant` in webhook |
| SAIA API outage | Chatbot 500s | Fallback message; log to Sentry; graceful degradation |
| DB connection exhaustion under load | 500s on all routes | Connection pool limits; PgBouncer in prod |
| Cart sync bugs between guest/user | Lost carts on login | Server is source of truth; merge with conflict resolution (newer wins) |
| SEO index bloat from variant URLs | Crawl waste | Single canonical URL per product; variants as `?v=sku` not paths |
| Email deliverability | Lost confirmations | Resend with SPF/DKIM/DMARC; monitor bounce rate |
| Admin account compromise | Store takeover | Strong password policy, optional 2FA (v1.1), audit log alerts |
| Refund disputes | Chargebacks | Clear refund policy; respond within 48h |
| **B2B admin bottleneck on quote turnaround** | Wholesale buyers churn | B2B SLA in `/wholesale` page ("quotes within 48h"); admin email/Slack alerts on new RFQ |
| **B2B pricing leaks to B2C site** | Competitive intel leak | No retail prices in B2B API responses; B2B pages are `noindex`; auth required |
| **Tax/customs complexity for international B2B** | Stalled orders | v1 quotes exclude tax/duties; admin adds in `notes` field manually |
| **Buyer disputes quote contents** | Conflict | Quote has unique ID, sent PDF is source of truth; user must accept to proceed |
| **Wholesale buyer cart abuse** | Admin overload | Rate limit: 5 quote submissions per user per day |

---

## 10. Success metrics (v1 launch + 30 days)

- [ ] Lighthouse: Performance 90+, A11y 95+, SEO 100
- [ ] Time to first byte (TTFB) < 200ms p95
- [ ] B2C checkout completion rate > 60%
- [ ] B2C cart abandonment rate < 75%
- [ ] B2B quote turnaround < 48h (admin metric)
- [ ] B2B quote acceptance rate > 40% (industry varies)
- [ ] Chatbot deflection: > 30% of questions answered without human
- [ ] Page views per session > 3
- [ ] Mobile traffic > 60%
- [ ] Zero P0 bugs in production
- [ ] < 1% error rate on `/api/checkout` and `/api/webhooks/stripe`

---

## 11. Open questions to resolve before implementation

1. **Email provider** — Resend (recommended) vs AWS SES vs SendGrid?
2. **Hosting** — Vercel + Fly.io (managed, easy) vs Docker on a single VPS (cheaper, more ops)?
3. **Image storage** — Local for v1 then S3, or S3 from day 1?
4. **Currency** — Confirm USD only for v1?
5. **Languages** — English only for v1, then EN+AR in v1.1?
6. **Refund policy** — 30 days (current plan), or different?
7. **Shipping** — Real-time carrier rates (USPS/UPS/DHL API) or flat-rate only for v1?
8. **Admin 2FA** — Required for v1, or defer to v1.1?
9. **Sample products** — Does `sample_products.json` have real images, or placeholders to source first?
10. **Brand assets** — Logo, color palette beyond `stone`/`rose` — finalized?
11. **B2B MOQ policy** — Default minimum order quantity per product, or set per product?
12. **B2B payment terms** — How strict is "Net-30 manual"? Is there a credit limit per buyer? (v1: unlimited, admin discretion)
13. **B2B shipping** — Who pays? Freight on board (FOB) origin vs destination? v1 assumption: buyer pays, added to quote.
14. **B2B geographic scope** — US only for v1, or international? Affects tax/customs complexity.

---

## 12. Effort & timeline summary

| Phase | Weeks | Outcome |
|---|---|---|
| 1. Foundation | 1 | Runnable dev env, baseline migration, seed data |
| 2. Auth (B2C) | 1 | Register/login/logout, wishlist |
| 3. Cart + Checkout (B2C) | 2 | End-to-end purchase with Stripe |
| 4. Admin (B2C) | 2 | Products, import, orders, coupons, chatbot logs |
| **4.5. B2B portal** | **3.5** | **Signup, approval, quote flow, admin tools** (parallel with 5) |
| 5. Chatbot | 1 | Production-ready SAIA integration (B2C + B2B branches) |
| 6. SEO + Polish | 1 | Lighthouse 90+, a11y, emails (B2C focus) |
| 7. Hardening + Launch | 2 | Tests, security, deployment |
| **Total** | **~13.5 weeks** | **Production launch with B2C + B2B** |

v1.1 (post-launch): reviews/Q&A, i18n (EN+AR), multi-currency, advanced search, RAG chatbot, B2B tiered pricing, B2B self-service.

---

## 13. Next steps

If you approve this plan, the recommended order of execution is:

1. **Phase 1.1** (Alembic baseline migration) — unblocks everything
2. **Phase 1.3** (seed script) — gives you real data to develop against
3. **Phase 3** (cart + checkout) — most user-visible value, validates the most complex integration (Stripe)
4. **Phase 4** (admin) — gives you a working shop
5. **Phase 4.5** (B2B portal) — runs partly in parallel with Phase 5
6. **Phase 5** (chatbot) — differentiator
7. **Phases 6 & 7** (polish + launch)

The plan is sequenced so that each phase produces something testable. No phase is a "sprint zero" that delivers nothing visible.

---

## 14. Future expansion (v1.1+)

**B2C additions:**
- Reviews & Q&A
- Internationalization (EN + AR with RTL)
- Multi-currency
- Real-time shipping rates (USPS/UPS/DHL API)
- Admin 2FA
- Advanced search (Meilisearch)
- Loyalty / rewards points
- Subscriptions / pre-orders

**B2B additions:**
- Tiered pricing (volume-based)
- Automated Net-30 / Net-60 terms (Stripe B2B)
- Self-service credit application
- Punchout (cXML/OCI) for buyer ERPs
- Per-buyer custom catalogs
- Quick-order grid UI
- Volume-based discounts
- B2B-specific analytics dashboard
- B2B mobile app (PWA)

**Platform additions:**
- Native mobile apps (React Native)
- Marketplace / multi-vendor
- White-label option for other modest-fashion brands
- Live chat with human sales reps (Intercom or Crisp)
- AI-powered product recommendations
- AR try-on (for abayas / khimar fitting)

---

**End of plan v2. This file is the source of truth going forward. The original `plan.md` (v1) is deprecated and can be archived.**
