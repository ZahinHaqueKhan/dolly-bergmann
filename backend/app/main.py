from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from app.auth import auth_router
from app.config import settings
from app.routers.products import router as products_router
from app.routers.categories import router as categories_router
from app.routers.cart import router as cart_router
from app.routers.orders import router as orders_router
from app.routers.checkout import router as checkout_router
from app.routers.webhooks import router as webhooks_router
from app.routers.chatbot import router as chatbot_router
from app.routers.admin import router as admin_router
from app.routers.admin_coupons import router as admin_coupons_router
from app.routers.health import router as health_router
from app.routers.wishlist import router as wishlist_router
from app.routers.uploads import router as uploads_router, mount_uploads
from app.routers.wholesale import router as wholesale_router, admin_router as wholesale_admin_router


# ---- PLAN 7.1 — Security Headers ----
# The FastAPI Swagger UI at /docs and /redoc uses inline scripts that
# would be blocked by our strict CSP. We skip headers on those paths
# so dev still works in production. Everything else gets the full set
# of hardening headers from PLAN §7.1.

_CSP = (
    "default-src 'self'; "
    "script-src 'self' 'unsafe-inline' js.stripe.com; "
    "style-src 'self' 'unsafe-inline'; "
    "img-src 'self' data: https:; "
    "font-src 'self' data:; "
    "connect-src 'self' api.stripe.com; "
    "frame-src 'self' js.stripe.com; "
    "frame-ancestors 'none'"
)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        path = request.url.path
        # Skip headers on Swagger UI paths — they need inline scripts.
        if path.startswith("/docs") or path.startswith("/redoc"):
            return response
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Strict-Transport-Security"] = (
            "max-age=31536000; includeSubDomains; preload"
        )
        response.headers["Content-Security-Policy"] = _CSP
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = (
            "camera=(), microphone=(), geolocation=()"
        )
        return response


class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, requests_per_minute: int = 100):
        super().__init__(app)
        self.requests_per_minute = requests_per_minute
        self.request_counts: dict[str, list[float]] = {}

    async def dispatch(self, request: Request, call_next):
        client_ip = request.client.host if request.client else "unknown"
        import time

        current_time = time.time()
        window_start = current_time - 60

        if client_ip not in self.request_counts:
            self.request_counts[client_ip] = []

        self.request_counts[client_ip] = [
            t for t in self.request_counts[client_ip] if t > window_start
        ]

        if len(self.request_counts[client_ip]) >= self.requests_per_minute:
            return JSONResponse(
                status_code=429,
                content={"detail": "Too many requests"},
            )

        self.request_counts[client_ip].append(current_time)
        return await call_next(request)


# PLAN 7.4 — Sentry integration deferred. The init block below is
# where `sentry-sdk[fastapi]` would be wired:
#
#   import sentry_sdk
#   if settings.SENTRY_DSN:
#       sentry_sdk.init(
#           dsn=settings.SENTRY_DSN,
#           environment=settings.ENVIRONMENT,
#           traces_sample_rate=0.1,
#       )
#
# v1 ships without Sentry; we rely on uvicorn logs + the existing
# `[wholesale]` / `[chatbot]` stdout prints for error visibility.


app = FastAPI(title="ModestWear Store API", version="1.0.0")

# PLAN 7.2 — CORS strict allowlist. Only the configured FRONTEND_URL
# is permitted; no wildcards. In dev that's http://localhost:3000
# (or http://127.0.0.1:3010 if the dev server is running on 3010).
# Add additional dev origins here if you run a non-default port.
_cors_origins = [settings.FRONTEND_URL]
if settings.ENVIRONMENT == "development" or settings.ENVIRONMENT == "dev":
    for extra in ("http://localhost:3000", "http://127.0.0.1:3010"):
        if extra not in _cors_origins:
            _cors_origins.append(extra)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(RateLimitMiddleware, requests_per_minute=100)

app.include_router(auth_router)
app.include_router(products_router, prefix="/api")
app.include_router(categories_router, prefix="/api")
app.include_router(cart_router, prefix="/api")
app.include_router(orders_router, prefix="/api")
app.include_router(checkout_router, prefix="/api")
app.include_router(webhooks_router, prefix="/api")
app.include_router(chatbot_router, prefix="/api")
app.include_router(admin_router, prefix="/api")
app.include_router(admin_coupons_router, prefix="/api")
app.include_router(uploads_router, prefix="/api")
app.include_router(wishlist_router)
app.include_router(health_router)
app.include_router(wholesale_router, prefix="/api")
app.include_router(wholesale_admin_router, prefix="/api")

mount_uploads(app)


@app.get("/health")
async def health_check():
    return {"status": "healthy"}
