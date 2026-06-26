# ModestWear Store

Fast, secure, SEO-optimized ecommerce platform for modest fashion (dresses, khimar, headscarves). Built with Next.js 16 (App Router) + FastAPI.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 (App Router, TypeScript, Tailwind CSS) |
| Backend | FastAPI (Python 3.12, async) |
| Database | PostgreSQL + SQLAlchemy (async) + Alembic |
| Auth | JWT (access + refresh tokens), Argon2 hashing |
| Payments | Stripe Checkout + Webhooks |
| AI Chatbot | SAIA API |
| Caching | Redis (rate limiting) |

## Features

- **Customer**: Browse catalog, cart, checkout, order history, wishlist
- **Admin**: Dashboard, product CRUD, JSON bulk import, order management, coupons, chatbot log review, image upload
- **AI Chatbot**: SAIA-powered FAQ, size guidance, order status (authenticated)
- **SEO**: SSR/SSG, JSON-LD structured data, sitemap, robots.txt, Open Graph

## Project Structure

```
.
├── plan.md                 # Full project plan
├── README.md               # This file
├── backend/
│   ├── app/
│   │   ├── main.py         # FastAPI app + middleware
│   │   ├── config.py        # Settings (pydantic-settings)
│   │   ├── database.py     # Async SQLAlchemy engine
│   │   ├── auth/           # JWT auth (router + service)
│   │   ├── models/         # 11 SQLAlchemy models
│   │   ├── schemas/        # 8 Pydantic schema modules
│   │   └── routers/        # 7 API routers (products, cart, orders, checkout, webhooks, chatbot, admin)
│   ├── alembic/            # DB migrations
│   ├── requirements.txt
│   ├── .env.example
│   └── venv/               # Python virtual environment
└── frontend/
    ├── app/
    │   ├── layout.tsx      # Root layout (Header, Footer, Chatbot)
    │   ├── page.tsx        # Homepage
    │   ├── shop/           # Product listing
    │   ├── product/[slug]/ # Product detail (SSR + JSON-LD)
    │   ├── cart/           # Cart page
    │   ├── checkout/       # Checkout flow
    │   ├── account/        # Login/register + order history
    │   └── api/chatbot/    # Chatbot API proxy
    ├── components/         # Header, Footer, ProductCard, ChatbotWidget
    ├── store/cart.ts       # Zustand cart store (persisted)
    ├── next.config.ts
    └── package.json
```

## Setup

### Prerequisites

- Python 3.12+
- Node.js 18+
- PostgreSQL 14+
- Redis (optional, for production rate limiting)

### Backend

```bash
cd backend

# Create and activate virtual environment
python -m venv venv
source venv/bin/activate  # or `venv\Scripts\activate` on Windows

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env with your DATABASE_URL, JWT_SECRET, Stripe keys, SAIA keys

# Run database migrations
alembic upgrade head

# Start development server
uvicorn app.main:app --reload --port 8000
```

API runs at `http://localhost:8000`. API docs at `http://localhost:8000/docs`.

### Frontend

```bash
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev
```

Store runs at `http://localhost:3000`.

## API Endpoints

### Auth
- `POST /api/auth/register` — Register
- `POST /api/auth/login` — Login (returns JWT)
- `POST /api/auth/refresh` — Refresh token
- `GET /api/auth/me` — Current user

### Products
- `GET /api/products` — List (filters: category, min_price, max_price, size, color, search, pagination)
- `GET /api/products/:slug` — Detail
- `POST/PUT/DELETE /api/products` — Admin only

### Categories
- `GET /api/categories` — List all
- `POST/PUT/DELETE /api/categories` — Admin only

### Cart
- `GET /api/cart` — Get current cart (auth cookie OR `X-Session-Id` header)
- `POST /api/cart/items` — Add item. On login, the guest cart (by `X-Session-Id`) merges into the user cart.
- `PUT /api/cart/items/:id` — Update quantity (0 removes)
- `DELETE /api/cart/items/:id` — Remove item
- `DELETE /api/cart` — Clear all
- All mutations validate stock in real-time and reject with 400 if `quantity > variant.stock`.

### Checkout
- `POST /api/checkout` — Create a Stripe Checkout Session
  - Body: `{ shipping_address: {...}, coupon_code?: string }`
  - Returns `{ checkout_url, session_id, total }`
  - Coupons are applied **locally** (single source of truth). Stripe `discounts[]` is NOT used — see `stripe-checkout-flow` skill in `.opencode/skills/`.
  - `idempotency_key` is `sha256(cart + caller_id)`, so a double-click reuses the same Stripe session.
  - On Stripe failure with a placeholder key, the endpoint mints a fake `cs_test_fake_*` session id so the rest of the flow is exercisable end-to-end.

### Webhooks
- `POST /api/webhooks/stripe` — Stripe webhook handler
  - Verifies signature against the **raw body** (not `request.json()`) using `STRIPE_WEBHOOK_SECRET`.
  - On `checkout.session.completed`: re-fetches the session, upserts the Order on `stripe_payment_intent_id` (UNIQUE INDEX = idempotent), populates `shipping_address` from `session.shipping_details.address`, creates `OrderItem` rows, and **decrements stock under `SELECT ... FOR UPDATE`** to prevent oversell races.
  - On `payment_intent.payment_failed`: marks the order `cancelled`.
  - Outside any rate limiter; does not require auth (Stripe signs for it).

### Orders
- `GET /api/orders` — List current user's orders
- `GET /api/orders/:id` — Detail (auth: owner only)
- `GET /api/orders/by-stripe/:session_id` — Public-by-stripe-id lookup for the `/order/success` page (owner or admin only)
- `GET /api/orders/admin` — Admin: all orders
- `PUT /api/orders/admin/:id/status` — Admin: status update (`pending|paid|shipped|delivered|cancelled|refunded`). Transitions to `cancelled` or `refunded` from `paid` restore stock.
- `POST /api/orders/admin/:id/refund` — Admin: issue a Stripe refund (full or `amount_cents` partial).

### Chatbot
- `POST /api/chatbot` — Send message to SAIA (rate limited: 10 req/min)

### Admin
- `GET /api/admin/dashboard` — Stats (KPIs, recent orders, low stock)
- `GET /api/products/admin/:id` — Admin product detail (incl. variants + is_active)
- `POST /api/products/admin/bulk-active` — Toggle `is_active` for a list of product IDs
- `POST /api/products/admin/bulk-delete` — Delete a list of product IDs
- `POST /api/admin/products/import/preview` — Validate + persist JSON import, returns `job_id`
- `POST /api/admin/products/import/confirm` — Execute persisted import job
- `GET /api/admin/import/:job_id` — Poll import job status
- `GET /api/admin/coupons` · `POST` · `PUT /:id` · `DELETE /:id` — Coupon CRUD
- `GET /api/orders/admin` — List orders (filters: status, search by id/email, date range)
- `GET /api/orders/admin/:id` — Order detail (admin)
- `PUT /api/orders/admin/:id/status` — Update fulfillment status
- `POST /api/orders/admin/:id/refund` — Issue a Stripe refund (full or partial)
- `GET /api/admin/chatbot/unanswered` — Errored + refusal-flagged chatbot logs
- `POST /api/admin/chatbot/:id/resolve` — Mark a log entry as resolved
- `POST /api/uploads` — Multipart image upload (admin only, local `/uploads/products/`)
- `GET /uploads/*` — Static-served uploaded files

## Admin JSON Import Format

`schema_version` is the forward-compat header. v1 is the only supported
version today; future versions will be branched on this field.

```json
{
  "schema_version": 1,
  "products": [
    {
      "name": "Classic Black Khimar",
      "slug": "classic-black-khimar",
      "description": "Premium jersey khimar...",
      "category": "Khimar",
      "tags": ["bestseller", "essentials"],
      "images": ["https://..."],
      "variants": [
        {
          "size": "S/M",
          "color": "Black",
          "price": 4900,
          "stock": 25,
          "sku": "KHIMAR-BLK-SM",
          "images": ["https://..."]
        }
      ]
    }
  ]
}
```

**Field rules** (enforced by `app/services/import_validator.py` + Pydantic):

| Field | Rule |
|---|---|
| `slug` | `^[a-z0-9-]+$`, 1–120 chars |
| `price` | integer cents, 1 ≤ price ≤ 1,000,000 |
| `stock` | 0 ≤ stock ≤ 100,000 |
| `sku` | `^[A-Z0-9-]{1,64}$` if provided |
| `images` | each URL starts with `https://` or `/` |
| `tags` | each ≤ 32 chars, ≤ 10 per product |
| `category` | ≤ 64 chars |
| `variants` | 1–50 per product |

Price is in cents (e.g., 4900 = $49.00). Categories are auto-created
if they don't exist. Slugs that already exist are SKIPPED (not
overwritten) so re-running confirm is safe. The preview response
includes a dry-run diff (`would_create`, `would_update`).

## Stripe (Test Mode)

The checkout flow uses **Stripe Checkout (hosted)**: the customer is redirected to Stripe, then Stripe POSTs `checkout.session.completed` to `/api/webhooks/stripe` to confirm the payment.

### 1. Get Stripe test keys

Sign up at <https://dashboard.stripe.com> (test mode toggle on). Copy the test keys into `backend/.env`:

```bash
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLIC_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

`STRIPE_WEBHOOK_SECRET` is **not** available from the dashboard — you get it from the Stripe CLI (next step).

### 2. Install + run the Stripe CLI

The CLI forwards webhook events from Stripe to your local backend so you can iterate on the webhook handler without deploying.

```bash
# macOS
brew install stripe/stripe-cli/stripe
# Debian/Ubuntu
# See https://stripe.com/docs/stripe-cli#install
stripe login
stripe listen --forward-to localhost:8000/api/webhooks/stripe
```

When `stripe listen` starts, it prints a `whsec_...` signing secret — copy that into `STRIPE_WEBHOOK_SECRET` in `backend/.env` and restart uvicorn.

### 3. Trigger a checkout in the UI

- Run the frontend (`cd frontend && npm run dev`) and backend (`cd backend && uvicorn app.main:app --reload`).
- Add a product to cart, proceed to checkout, fill the address form.
- The "Place Order" button redirects to Stripe's hosted checkout.

### 4. Test cards

| Card | Behavior |
|---|---|
| `4242 4242 4242 4242` | Success — any future date, any CVC, any postcode |
| `4000 0000 0000 0002` | Declined by the issuer |
| `4000 0025 0000 3155` | Requires 3D Secure authentication |
| `4000 0000 0000 9995` | Insufficient funds declined |

Use any future expiry and any 3-digit CVC. See <https://stripe.com/docs/testing> for the full list.

### 5. Inspect the webhook

```bash
# In a separate terminal:
stripe events list --limit 5
stripe events resend evt_...
stripe trigger checkout.session.completed
```

The webhook handler:
- Verifies the signature with `stripe.Webhook.construct_event(payload, signature, secret)`.
- Idempotently upserts the Order on `stripe_payment_intent_id` (unique index).
- Populates `shipping_address` from `session.shipping_details.address`.
- Decrements stock under `SELECT ... FOR UPDATE` to prevent oversell races.
- Deletes the caller's cart items.
- Sends the order confirmation email (deferred to Phase 6 — see the `print()` at the bottom of `_handle_checkout_completed` for now).

### 6. End-to-end test without real keys

If you don't have Stripe test keys yet, set `STRIPE_SECRET_KEY=sk_test_placeholder` in `backend/.env`. The checkout endpoint will mint a fake `cs_test_fake_*` session id, write a `pending` Order placeholder, and return a redirect URL pointing to the local `/order/success` page. The full webhook flow can be driven from there via `/scripts/test_phase3.sh`.

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | postgresql+asyncpg://... |
| `JWT_SECRET` | Secret for JWT signing | change-me |
| `JWT_ALGORITHM` | JWT algorithm | HS256 |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Access token TTL | 15 |
| `REFRESH_TOKEN_EXPIRE_DAYS` | Refresh token TTL | 7 |
| `STRIPE_PUBLIC_KEY` | Stripe publishable key | - |
| `STRIPE_SECRET_KEY` | Stripe secret key | - |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook secret | - |
| `CURRENCY` | Currency code for Stripe line items | `usd` |
| `SAIA_API_URL` | SAIA API endpoint | - |
| `SAIA_API_KEY` | SAIA API key | - |
| `FRONTEND_URL` | Frontend URL (CORS) | http://localhost:3000 |

## Security Features

- Argon2 password hashing
- JWT with short-lived access tokens + refresh tokens
- Admin RBAC (role-based access control)
- Stripe webhook signature verification
- Rate limiting (100 req/min general, 10 req/min for chatbot)
- Input validation (Pydantic + Zod)
- Security headers (CSP, HSTS, X-Frame-Options)
- Audit logging for admin actions

## Phase 4 — Admin (Store-Owner Self-Service)

The store owner can run the shop without a developer. Sign in as admin
and visit `/admin`. Every page under `/admin/*` runs a server-side
role=admin check against `/api/auth/me`; non-admins (and anonymous
visitors) are redirected to `/account/login?next=/admin`.

**Admin pages:**

| Path | Purpose |
|---|---|
| `/admin` | Dashboard — total products, total orders, total revenue, low stock, recent orders, quick actions |
| `/admin/products` | Product list with search, category filter, status filter; 20 per page |
| `/admin/products/new` | Create form (details + multi-image upload + variant editor) |
| `/admin/products/[id]/edit` | Edit form, pre-filled |
| `/admin/import` | Drop a `.json` file → preview → confirm → progress polling |
| `/admin/orders` | Order list with status / search / date filters |
| `/admin/orders/[id]` | Order detail, status update, refund action |
| `/admin/coupons` | Coupon CRUD: percent / fixed_amount / free_shipping |
| `/admin/chatbot` | Review errored + refusal-flagged chatbot exchanges, mark resolved |
| `/admin/settings` | v1 placeholder |

**Image upload:** images are multipart-POSTed to `/api/uploads` (admin
only), written to `uploads/products/{token}.{ext}` (8 MB cap,
JPEG/PNG/WebP/AVIF), and served back via `/uploads/*` (StaticFiles
mount in `app.main`). Object storage (S3/Cloudflare) is a future
phase.

**Import jobs** are persisted to the `import_jobs` table — no more
in-memory dict. The preview step validates the file, persists the job
with `schema_version`, and returns a dry-run diff
(`would_create` / `would_update`). The confirm step then runs the
persisted job. Re-confirming a completed job returns 400. Slugs that
already exist are SKIPPED (not overwritten) so the import is
idempotent.

**Coupons** support `percent`, `fixed_amount`, and `free_shipping`
discount types, with `starts_at` / `ends_at` validity window,
`usage_limit` (global), `per_user_limit`, and `is_active` toggle.
`/api/checkout` applies the coupon locally and respects all four
validity rules. A `free_shipping` coupon zeroes out the shipping cost
even when the subtotal is below the $100 free-shipping threshold.

**Run the smoke test:**

```bash
bash scripts/test_phase4.sh
```

The script exercises every admin endpoint end-to-end (auth, dashboard,
products CRUD + image upload + bulk-active, JSON import, orders list
+ status update, coupons CRUD + validity, chatbot log resolve). Admin
login is `admin@modestwear.test` / `admin_secret_password_123`.

## Phase 4.5 — B2B Wholesale Portal

Wholesale buyers self-serve quote requests, eliminating the email
back-and-forth. The portal reuses the B2C catalog, components, and
design system — there is no separate brand or stripe-style checkout.

### Data model

Four new tables plus field additions on `users` and `products` (single
migration `phase_4_5_wholesale_applications_quotes_*.py`):

- `wholesale_applications` — signup → approval. Fields: `user_id`,
  `company_name`, `tax_id`, `country`, `phone`, `website`, `notes`,
  `status` (`pending`|`approved`|`rejected`|`info_requested`),
  `rejection_reason`, `decided_by`, `decided_at`, `created_at`.
- `quotes` — RFQ + priced quote. Fields: `user_id`, `status`
  (`draft`|`submitted`|`sent`|`accepted`|`declined`|`expired`),
  `valid_until`, `shipping_cost`, `tax`, `notes`, `admin_notes`,
  `pdf_path`, `created_at`, `sent_at`, `responded_at`.
- `quote_line_items` — `quote_id`, `variant_id`, `quantity`,
  `unit_price` (set by admin; null until priced).
- `wholesale_orders` — `quote_id` (unique), `user_id`, `status`
  (`awaiting_payment`|`paid`|`processing`|`shipped`|`delivered`|`cancelled`),
  `payment_status` (`pending`|`paid`|`partial`), `paid_at`,
  `tracking_number`, `shipping_carrier`, `total`, `created_at`.
- `users` — `role` enum already has `wholesale` from Phase 2; new fields
  `company_name`, `tax_id`, `approved_at`.
- `products` — `b2b_only` (boolean, default `false`), `b2b_min_order_qty`
  (integer, default `1`).

### API surface

`backend/app/routers/wholesale.py` exposes two routers.

**Buyer (`/api/wholesale/...`):**

| Method | Path | Purpose |
|---|---|---|
| POST | `/signup` | Create user (role=wholesale) + pending application, auto-login |
| GET | `/me` | Current user + application status |
| GET | `/quotes` | List my quotes |
| POST | `/quotes` | Create a new RFQ (rate-limited 5/day) — supports `line_items` cart OR `csv` (`sku,quantity` lines) |
| GET | `/quotes/{id}` | One quote (owner or admin) |
| POST | `/quotes/{id}/accept` | Accept priced quote → creates WholesaleOrder |
| POST | `/quotes/{id}/decline` | Decline priced quote |
| GET | `/orders` | List my wholesale orders |
| GET | `/orders/{id}` | One order |

**Admin (`/api/admin/wholesale/...`):**

| Method | Path | Purpose |
|---|---|---|
| GET | `/applications` | List all applications |
| GET | `/applications/{id}` | One application |
| POST | `/applications/{id}/approve` | Approve — sets `User.approved_at`, email user (stdout) |
| POST | `/applications/{id}/reject` | Reject — sets `rejection_reason`, email user |
| POST | `/applications/{id}/request-info` | Set status `info_requested` with reason |
| GET | `/quotes` | All quotes (admin view) |
| GET | `/quotes/{id}` | One quote (admin) |
| PUT | `/quotes/{id}` | Set per-line `unit_price_cents`, `shipping_cost`, `tax`, `notes`, `admin_notes`, `valid_until` |
| POST | `/quotes/{id}/send` | Mark `status=sent`, generate PDF, email buyer |
| GET | `/quotes/{id}/pdf` | Serve the generated PDF (or HTML fallback) |
| GET | `/orders` | All wholesale orders |
| GET | `/orders/{id}` | One order |
| POST | `/orders/{id}/mark-paid` | Set `payment_status=paid`, email buyer |
| PUT | `/orders/{id}/status` | Update status; tracking_number/carrier required on `shipped` |

### Frontend pages

**Buyer portal (`/wholesale/*` — `noindex, nofollow`):**

| Path | Purpose |
|---|---|
| `/wholesale` | Catalog (all products, no prices, "Request quote" badge, add-to-quote modal with size/color/qty) |
| `/wholesale/signup` | Apply for a wholesale account |
| `/wholesale/pending` | Status page for pending/rejected/info_requested users |
| `/wholesale/quote/new` | Build RFQ (cart or CSV paste, both converge to same submit) |
| `/wholesale/quotes` | List of submitted quotes |
| `/wholesale/quotes/[id]` | View one quote; Accept/Decline buttons when `status=sent` |
| `/wholesale/orders` | List of orders |
| `/wholesale/orders/[id]` | Order detail with status timeline |

**Admin (`/admin/wholesale/*` — lives in the existing admin layout, new "Wholesale" tab):**

| Path | Purpose |
|---|---|
| `/admin/wholesale/applications` | Approve / reject / request info |
| `/admin/wholesale/quotes` | All quotes |
| `/admin/wholesale/quotes/[id]` | Price RFQ, set shipping/tax/notes, send |
| `/admin/wholesale/orders` | All orders |
| `/admin/wholesale/orders/[id]` | Mark paid, update status, add tracking |

### End-to-end flow

1. Buyer visits `/wholesale/signup`, fills company info, submits.
2. Backend creates a `User` (`role=wholesale`) + `WholesaleApplication`
   (`status=pending`) and auto-logs them in. Email notification is
   printed to stdout (deferred to Resend in Phase 6).
3. Admin sees the application at `/admin/wholesale/applications`,
   clicks Approve. `User.approved_at` is set; the buyer is emailed.
4. Approved buyer logs in, browses `/wholesale`, adds items to a
   draft quote (variant selector + quantity, MOQ enforced).
5. Buyer goes to `/wholesale/quote/new`, completes the RFQ via cart
   OR pastes a CSV (`sku,quantity` lines), submits.
6. Admin reviews at `/admin/wholesale/quotes/[id]`, sets unit prices
   per line, adds shipping/tax/notes, clicks **Send quote**.
7. Backend generates the quote PDF (WeasyPrint if available, otherwise
   an HTML file pointed to by `pdf_path` — both are served at
   `/api/admin/wholesale/quotes/{id}/pdf`). Status → `sent`, email
   printed to stdout.
8. Buyer opens `/wholesale/quotes/[id]`, sees the priced quote with
   Accept/Decline buttons.
9. **Accept** → creates a `WholesaleOrder` (`status=awaiting_payment`,
   `payment_status=pending`). **Decline** → `status=declined`.
10. Admin marks the order paid once the wire/check arrives
    (`/admin/wholesale/orders/[id]`, "Mark as paid"). Email printed to
    stdout. Order moves to `status=paid`.
11. Admin ships the order: status → `shipped`, adds `tracking_number`
    and `shipping_carrier`.
12. Buyer sees the status + tracking in `/wholesale/orders/[id]`. The
    status timeline progresses `awaiting_payment → paid → processing →
    shipped → delivered`.

### Constraints honored

- **No separate design system.** B2B pages reuse the same Tailwind
  components (`bg-stone-*`, `text-rose-*`, `font-serif` for headings,
  the `statusColor()` helper from `admin/page.tsx`, the existing
  `ProductCard` patterns). All B2B color usage stays in stone/rose.
- **No prices on the portal.** Every product on `/wholesale` shows a
  "Request quote" badge instead of a price.
- **No Stripe for B2B.** Wholesale uses offline payment (Net-30 by
  default). The order's `payment_status` is flipped to `paid` manually
  by the admin once funds clear.
- **`<meta name="robots" content="noindex, nofollow">`** on every
  `/wholesale/*` page (set in the wholesale `layout.tsx` and on
  individual page metadata).
- **Auth gate.** Every `/wholesale/*` page requires `role=wholesale`.
  Approved-only sub-pages (`/wholesale`, `/wholesale/quote/new`,
  `/wholesale/quotes/*`, `/wholesale/orders/*`) additionally check
  `User.approved_at != null` and redirect pending users to
  `/wholesale/pending`.
- **Rate limit: 5 quote submissions per buyer per day.** Enforced in
  `app/routers/wholesale.py` via an in-memory deque. Will be replaced
  with Redis-backed limiting in Phase 5.4.
- **MOQ enforcement.** Backend rejects any line item below the
  product's `b2b_min_order_qty`; the add-to-quote modal also enforces
  it client-side.
- **PDF generation.** Tries WeasyPrint first; on any failure, falls
  back to writing a styled HTML file and pointing `pdf_path` at it.
  Both formats are served at the same `/api/admin/wholesale/quotes/{id}/pdf`
  endpoint. The HTML template is rendered from
  `_render_quote_html(quote, user)` in `wholesale.py`.
- **Email.** All notifications (signup, approval, rejection, info
  request, quote sent, payment received) are printed to stdout with
  subject + recipient + key data. Resend integration is deferred to
  Phase 6.

### Chatbot wholesale addendum (§4.5.9)

`backend/app/prompts/wholesale_faq.v1.md` is a Markdown addendum that
covers: how to apply, MOQ, Net-30 payment terms, shipping, lead times,
custom orders, and how the portal works. It is loaded into the chatbot
system prompt **only** when the request is authenticated AND
`User.role == "wholesale"` AND `User.approved_at is not None`. Pending
or rejected users see the standard B2C prompt.

### How to run

The end-to-end script covers apply → approve → RFQ via CSV → admin
sends → buyer accepts → admin marks paid → admin ships → buyer sees
tracking. It also covers the 5/day RFQ rate limit and the customer-403
guard. From the repo root:

```bash
bash scripts/test_phase4.5.sh
```

Backend must be running on `127.0.0.1:8000` with `alembic upgrade head`
applied. Admin login: `admin@modestwear.test` /
`admin_secret_password_123`.

### Exit criteria (from PLAN.md §4.5)

- [x] Wholesale buyer can apply, get approved, log in, browse catalog
- [x] Buyer can build RFQ via cart OR CSV upload
- [x] Admin receives notification, builds quote, sends PDF
- [x] Buyer accepts quote → order created
- [x] Admin marks paid, updates status, adds tracking
- [x] Buyer sees status updates in `/wholesale/orders`

## Phase 5 — AI chatbot: SAIA integration

The customer-facing chatbot at `frontend/components/ChatbotWidget.tsx`
sends messages to the backend `/api/chatbot` endpoint, which proxies
them to SAIA (a chat-completions API at
`https://chat-ai.academiccloud.de/v1`). Failed SAIA calls return
**HTTP 200 with a graceful fallback answer** — the API never 500s.

### Prompt externalization (§5.1)

The system prompt is **not** a hardcoded string. It is concatenated
at request time from versioned Markdown files in
`backend/app/prompts/`:

| File | Always loaded? | Notes |
|---|---|---|
| `system_base.md` | yes | Tone, safety rules, refusal behavior |
| `product_faq.v1.md` | yes | B2C FAQ + 10 most-asked questions |
| `store_policies.md` | yes | Shipping, returns, sizing, payment policies |
| `seasonal/ramadan.md` | Feb 18 – Mar 19 | Auto-loaded during the Ramadan window |
| `seasonal/eid.md` | Eid al-Fitr + Eid al-Adha windows | Auto-loaded during Eid |
| `wholesale_faq.v1.md` | approved wholesale users only | Phase 4.5 §4.5.9 — not duplicated here |

The active bundle version is written to `ChatbotLog.prompt_version`
(e.g. `base+v1+policies+ramadan+wholesale`) for A/B analysis. Seasonal
addenda are detected by date — see `_seasonal_addendum()` in
`backend/app/routers/chatbot.py`.

### Guardrails (§5.2)

Implemented in `backend/app/routers/chatbot.py`:

- **PII strip.** On every input, the following patterns are replaced
  with redaction tokens before the text is sent to SAIA:
  - Credit card: `\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b` → `[REDACTED-CC]`
  - SSN: `\b\d{3}-\d{2}-\d{4}\b` → `[REDACTED-SSN]`
  - Email: `\b\S+@\S+\.\S+\b` → `[REDACTED-EMAIL]`
  - Phone: international-ish 7+ digit patterns → `[REDACTED-PHONE]`
  The raw user input is preserved in `ChatbotLog.question`; the
  redacted version is in `ChatbotLog.stripped_text` (NULL when no PII
  was detected).
- **Truncate input at 500 chars.** Truncates cleanly, no error.
- **Refusal detection.** After SAIA returns, the response is checked
  against known refusal phrases (`"i can't help"`, `"i'm not able to"`,
  etc.). If matched, `ChatbotLog.is_refusal = true`. The admin
  unanswered list (`/api/admin/chatbot/unanswered`) now also returns
  these rows.
- **Blocked intents.** Patterns matching refund / cancel order /
  change address / change payment / chargeback cause the system
  prompt to be **appended with a redirect-to-support note**, and the
  response includes `blocked_intent: "<label>"` so the client can
  surface it.

### Authenticated order-status lookup (§5.3)

If the user is authenticated (cookie or Bearer token) AND the message
contains one of `my order`, `where is`, `tracking`, `order status`,
`where are my`, the system prompt is **augmented with the user's last
3 orders** (B2C for `role=customer`, wholesale for `role=wholesale`).
The injected context is status-only — no PII, no item details:

```
Recent orders (last 3, status only — no PII):
Order #42: status=shipped, total=$49.99
Order #39: status=delivered, total=$29.50
```

The system prompt explicitly authorizes this lookup.

### Rate limiting (§5.4)

10 req/min per IP for anonymous users, 30 req/min per authenticated
user. Backed by Redis (`redis.asyncio`) using
`INCR ratelimit:chatbot:{user:42|ip:1.2.3.4}` + `EXPIRE 60`.

**Graceful fallback.** If Redis is unreachable, the router falls back
to a process-local `deque` keyed by the same string. The endpoint
never 500s on a Redis outage. `GET /api/chatbot/health` reports
`redis_available: false` so admins can see the degradation.

### Frontend widget (§5.5)

`frontend/components/ChatbotWidget.tsx`:

- Floating bottom-right button, slide-up panel.
- On viewports < 768px, the panel is **full-screen** (replaces
  `bottom-right` floating); on desktop it is a 384px × 576px panel.
- **Markdown rendering** with `react-markdown` + `remark-gfm`. Inline
  styles in `app/globals.css` under `.chatbot-prose` (no
  `@tailwindcss/typography` dependency).
- **localStorage** keeps the last 50 messages
  (`modestwear.chatbot.history.v1`) and the session id
  (`modestwear.chatbot.session.v1`).
- **Accessibility**: `role="dialog"`, `aria-modal`, `aria-labelledby`,
  focus trap, escape to close, focus restore on close,
  `prefers-reduced-motion` disables the slide-up transition.
- **Proxy** at `frontend/app/api/chatbot/route.ts` injects the
  httpOnly `chatbot_session_id` cookie as `X-Session-Id` for the
  backend, then forwards the request with the user's auth cookies
  attached.

### FAQ knowledge base (§5.6)

The 10 most-asked questions are inlined in `product_faq.v1.md` (the
"Most-asked questions" section). pgvector / RAG is deferred to v1.1
per PLAN.

### How to run

```bash
bash scripts/test_phase5.sh
```

The script covers: PII strip (with DB log assertion), blocked intent
detection, order-status for an authenticated user, rate limit
(anonymous 10/min, authenticated 30/min), and graceful Redis fallback
(returns 400 on empty input, never 500). Backend must be running on
`127.0.0.1:8000` with `alembic upgrade head` applied.

### Exit criteria (from PLAN.md §5)

- [x] Customer can ask "What's your return policy?" → accurate
      answer (info in `store_policies.md` + `product_faq.v1.md`)
- [x] Logged-in customer asks "Where is my order?" → real status
      returned (last 3 orders injected as context)
- [x] Logged-in B2B buyer asks "What's the MOQ?" → wholesale FAQ
      answer (`wholesale_faq.v1.md` is appended; see Phase 4.5)
- [x] Rate limit triggers 429 after the 10th anonymous request
- [x] Failed SAIA calls return 200 with a graceful fallback — never
      500
- [x] PII in test input is stripped before the SAIA call (verified
      via `ChatbotLog.stripped_text`)

## SEO Features

- SSR product/category pages (indexable)
- JSON-LD structured data: Product, Offer, BreadcrumbList, FAQPage
- Canonical URLs, dynamic sitemap, robots.txt
- Open Graph + Twitter Card meta tags
- Optimized images with srcset, WebP/AVIF, lazy loading
- Core Web Vitals optimized (LCP, CLS)