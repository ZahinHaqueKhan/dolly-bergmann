# Troubleshooting

Common issues and their fixes.

## Backend won't start

**`Address already in use` on port 8000**

Another process is bound to 8000. Find and stop it:

```bash
lsof -i :8000
kill <pid>
```

**`asyncpg.exceptions.InvalidPasswordError`**

Your `.env` `DATABASE_URL` doesn't match the running Postgres.
The dev default is `postgresql+asyncpg://dolly:dolly_secret_password@localhost:5432/dolly_bergmann`.

**`ModuleNotFoundError: app`**

You launched uvicorn from the wrong directory. Run from
`backend/`:

```bash
cd backend
venv/bin/uvicorn app.main:app --port 8000
```

**Migrations pending on startup**

The dev script does `alembic upgrade head` before starting. If you
skip that, run it manually:

```bash
cd backend
venv/bin/alembic upgrade head
```

## Stripe checkout fails

**"Stripe API key not configured"**

`STRIPE_SECRET_KEY` is empty in `.env`. The dev keys are placeholders;
checkout will fail until you put real test keys (or live keys) there.

**`502 Bad Gateway` from /api/checkout**

Stripe rejected the request. Check `/tmp/backend.log` for the
Stripe error. Common causes: invalid API key, mismatched webhook
secret, or an inactive test account.

## SAIA chatbot returns the fallback answer

**`SAIA_API_KEY` is empty**

The SAIA key in `.env` is a placeholder. The chatbot router is
designed to handle this gracefully — it returns a fallback answer
in the response and logs the error in `chatbot_logs`. Set a real
key to get real answers.

**Rate limit triggered**

Anonymous users get 10 req/min, authenticated users get 30
req/min. The 429 response includes a `Retry-After` header. With
Redis missing, the in-memory fallback takes over (no 500s).

## Wholesale buyer can't see the catalog

**`/wholesale` redirects to `/wholesale/pending`**

Pending applications see the status page. Wait for admin approval
or check `/api/wholesale/me` to see the current status.

**`403 Forbidden` on `/api/wholesale/quotes`**

The user's `User.approved_at` is NULL. The admin needs to approve
the application again.

## B2C checkout drops items at the last step

Check the variants' stock. The webhook's `with_for_update` lock
decrements stock atomically. If the customer sees a stock error
on the success page, the webhook has rolled the order back and
the user is redirected to /cart.

## Frontend `next/image` errors

**"Invalid src prop" on backend images**

You need to whitelist the backend host in
`frontend/next.config.ts`. The dev default is
`127.0.0.1:8000` and `localhost:8000`. Add your prod backend
hostname to `images.remotePatterns`.

## Redis is missing

The health endpoint reports `redis: missing`. The chatbot router
falls back to a process-local deque. To fix, run Redis locally:

```bash
docker run -d -p 6379:6379 redis:7
```

…or use Upstash / managed Redis in production.

## Frontend stuck on "Loading..."

Check that the backend is reachable from the frontend process. If
the frontend is on `127.0.0.1:3010` but the backend is on a
different host, the cross-origin request will fail. Set
`BACKEND_URL` in the frontend environment, and `FRONTEND_URL` in
the backend to match.

## Wholesale quote PDF is HTML, not PDF

WeasyPrint is optional. If it isn't installed, the
`/api/admin/wholesale/quotes/{id}/pdf` endpoint serves the styled
HTML version. Install WeasyPrint to get a real PDF:

```bash
pip install weasyprint
```

The route picks it up automatically on the next send.
