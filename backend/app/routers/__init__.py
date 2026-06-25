from app.routers.products import router as products_router
from app.routers.categories import router as categories_router
from app.routers.cart import router as cart_router
from app.routers.orders import router as orders_router
from app.routers.checkout import router as checkout_router
from app.routers.webhooks import router as webhooks_router
from app.routers.chatbot import router as chatbot_router
from app.routers.admin import router as admin_router
from app.routers.wishlist import router as wishlist_router

__all__ = [
    "products_router",
    "categories_router",
    "cart_router",
    "orders_router",
    "checkout_router",
    "webhooks_router",
    "chatbot_router",
    "admin_router",
    "wishlist_router",
]
