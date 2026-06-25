# ModestWear Store

Fast, secure, SEO-optimized ecommerce platform for modest fashion (dresses, khimar, headscarves). Built with Next.js 16 (App Router) + FastAPI.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15 (App Router, TypeScript, Tailwind CSS) |
| Backend | FastAPI (Python 3.12, async) |
| Database | PostgreSQL + SQLAlchemy (async) + Alembic |
| Auth | JWT (access + refresh tokens), Argon2 hashing |
| Payments | Stripe Checkout + Webhooks |
| AI Chatbot | SAIA API |
| Caching | Redis (rate limiting) |

## Features

- **Customer**: Browse catalog, cart, checkout, order history, wishlist
- **Admin**: Dashboard, product CRUD, JSON bulk import, order management
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
- `GET /api/admin/dashboard` — Stats
- `POST /api/admin/products/import/preview` — Validate JSON import
- `POST /api/admin/products/import/confirm` — Execute import
- `GET /api/admin/import/:job_id` — Import job status

## Admin JSON Import Format

```json
{
  "products": [
    {
      "name": "Classic Black Khimar",
      "slug": "classic-black-khimar",
      "description": "Premium jersey khimar...",
      "category": "Khimar",
      "variants": [
        {
          "size": "S/M",
          "color": "Black",
          "price": 4900,
          "stock": 25,
          "sku": "KHIMAR-BLK-SM",
          "images": ["https://..."]
        }
      ],
      "tags": ["bestseller", "essentials"]
    }
  ]
}
```

Price is in cents (e.g., 4900 = $49.00). Categories are auto-created if they don't exist.

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

## SEO Features

- SSR product/category pages (indexable)
- JSON-LD structured data: Product, Offer, BreadcrumbList, FAQPage
- Canonical URLs, dynamic sitemap, robots.txt
- Open Graph + Twitter Card meta tags
- Optimized images with srcset, WebP/AVIF, lazy loading
- Core Web Vitals optimized (LCP, CLS)