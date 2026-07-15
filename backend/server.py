"""Server entry point."""
import os
import logging
from pathlib import Path
from fastapi import FastAPI, APIRouter
from starlette.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from db import ensure_indexes, users_col, credit_packs_col, now_iso
from auth import hash_password
from models import User, CreditPack

from routers.auth_routes import router as auth_router
from routers.wallet_routes import router as wallet_router
from routers.chat_routes import router as chat_router
from routers.usage_routes import router as usage_router
from routers.pack_routes import router as pack_router
from routers.payments_routes import router as payments_router
from routers.notifications_routes import router as notifications_router
from routers.admin_routes import router as admin_router
from routers.uploads_routes import router as uploads_router

app = FastAPI(title="IEMA.ai v2 API", version="2.0.0")

api_router = APIRouter(prefix="/api")


@api_router.get("/")
async def root():
    return {"name": "IEMA.ai v2", "version": "2.0.0", "status": "ok"}


@api_router.get("/health")
async def health():
    return {"status": "healthy"}


api_router.include_router(auth_router)
api_router.include_router(wallet_router)
api_router.include_router(chat_router)
api_router.include_router(usage_router)
api_router.include_router(pack_router)
api_router.include_router(payments_router)
api_router.include_router(notifications_router)
api_router.include_router(admin_router)
api_router.include_router(uploads_router)

# Stripe webhook needs to be at /api/webhook/stripe (root-of-api)
from routers.payments_routes import stripe_webhook
api_router.add_api_route("/webhook/stripe", stripe_webhook, methods=["POST"], include_in_schema=False)

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


DEFAULT_PACKS = [
    {"name": "Starter", "slug": "starter-usd", "description": "Casual explorers", "price": 5.0, "currency": "usd", "credits": 500, "bonus_credits": 0, "is_popular": False, "sort_order": 1},
    {"name": "Standard", "slug": "standard-usd", "description": "Regular users", "price": 15.0, "currency": "usd", "credits": 1800, "bonus_credits": 200, "is_popular": True, "sort_order": 2},
    {"name": "Pro", "slug": "pro-usd", "description": "Power users", "price": 39.0, "currency": "usd", "credits": 5000, "bonus_credits": 750, "is_popular": False, "sort_order": 3},
    {"name": "Business", "slug": "business-usd", "description": "Teams & startups", "price": 99.0, "currency": "usd", "credits": 15000, "bonus_credits": 2500, "is_popular": False, "sort_order": 4},
    {"name": "Starter", "slug": "starter-inr", "description": "Casual explorers", "price": 399.0, "currency": "inr", "credits": 500, "bonus_credits": 0, "is_popular": False, "sort_order": 1},
    {"name": "Standard", "slug": "standard-inr", "description": "Regular users", "price": 1199.0, "currency": "inr", "credits": 1800, "bonus_credits": 200, "is_popular": True, "sort_order": 2},
    {"name": "Pro", "slug": "pro-inr", "description": "Power users", "price": 2999.0, "currency": "inr", "credits": 5000, "bonus_credits": 750, "is_popular": False, "sort_order": 3},
    {"name": "Business", "slug": "business-inr", "description": "Teams & startups", "price": 7999.0, "currency": "inr", "credits": 15000, "bonus_credits": 2500, "is_popular": False, "sort_order": 4},
]


@app.on_event("startup")
async def startup():
    await ensure_indexes()
    # Seed admin
    admin_email = os.environ.get("ADMIN_EMAIL", "").lower()
    admin_password = os.environ.get("ADMIN_PASSWORD", "")
    if admin_email and admin_password:
        existing = await users_col.find_one({"email": admin_email})
        if not existing:
            admin = User(
                email=admin_email,
                name="IEMA Admin",
                password_hash=hash_password(admin_password),
                role="admin",
                provider="email",
                email_verified=True,
            )
            await users_col.insert_one(admin.to_mongo())
            logger.info(f"Seeded admin user: {admin_email}")
        else:
            # Ensure role is admin
            if existing.get("role") != "admin":
                await users_col.update_one({"email": admin_email}, {"$set": {"role": "admin"}})

    # Seed credit packs
    for pack_data in DEFAULT_PACKS:
        exists = await credit_packs_col.find_one({"slug": pack_data["slug"]})
        if not exists:
            pack = CreditPack(**pack_data)
            await credit_packs_col.insert_one(pack.to_mongo())
    logger.info("IEMA.ai v2 API started")


@app.on_event("shutdown")
async def shutdown():
    from db import client
    client.close()
