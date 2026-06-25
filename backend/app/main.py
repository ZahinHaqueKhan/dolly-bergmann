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
from app.routers.health import router as health_router


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        response.headers["Content-Security-Policy"] = "default-src 'self'"
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


app = FastAPI(title="ModestWear Store API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL],
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
app.include_router(health_router)


@app.get("/health")
async def health_check():
    return {"status": "healthy"}
