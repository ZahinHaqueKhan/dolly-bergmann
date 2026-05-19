# ModestWear Store

Fast, secure, SEO-optimized ecommerce platform for modest fashion (dresses, khimar, headscarves). Built with Next.js 15 + FastAPI.

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
- `GET /api/cart` — Get current cart
- `POST /api/cart/items` — Add item
- `PUT /api/cart/items/:id` — Update quantity
- `DELETE /api/cart/items/:id` — Remove item

### Checkout
- `POST /api/checkout` — Create Stripe Checkout session

### Webhooks
- `POST /api/webhooks/stripe` — Stripe webhook handler

### Orders
- `GET /api/orders` — List (auth)
- `GET /api/orders/:id` — Detail (auth)
- `GET/PUT /api/admin/orders` — Admin order management

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