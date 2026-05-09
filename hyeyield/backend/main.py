import logging
import logging.config

# Configure logging with separate audit log
LOGGING_CONFIG = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "default": {
            "format": "%(asctime)s %(levelname)s %(name)s: %(message)s"
        },
        "json": {
            "format": "%(message)s"
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "default",
            "level": "INFO",
        },
        "audit_file": {
            "class": "logging.handlers.RotatingFileHandler",
            "filename": "logs/audit.log",
            "maxBytes": 104857600,  # 100MB
            "backupCount": 10,
            "formatter": "json",
            "level": "INFO",
        },
    },
    "loggers": {
        "audit": {
            "handlers": ["audit_file"],
            "level": "INFO",
            "propagate": False,
        },
        "": {
            "handlers": ["console"],
            "level": "INFO",
        },
    },
}

logging.config.dictConfig(LOGGING_CONFIG)

from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from backend.routers.auth import router as auth_router
from backend.routers.schwab import router as schwab_router
from backend.routers.invest import router as invest_router
from backend.routers.schedules import router as schedules_router
from backend.routers.events import router as events_router
from backend.services.scheduler import scheduler, load_all_jobs
from backend.utils.limiter import limiter
from backend.utils.csrf import csrf_protection
from backend.config import settings

app = FastAPI(title="Hye-Yield", version="1.0")

# Rate limiting
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Security middleware
app.add_middleware(
    TrustedHostMiddleware,
    allowed_hosts=["hyeyield.duckdns.org", "localhost", "127.0.0.1"],
)

# CORS - only allow from our domain
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://hyeyield.duckdns.org"] if settings.environment == "prod" else ["http://localhost:5173", "http://localhost:8000"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# Add security headers
@app.middleware("http")
async def add_security_headers(request, call_next):
    response = await call_next(request)

    # Security headers
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains; preload"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"

    return response


app.include_router(auth_router)
app.include_router(schwab_router)
app.include_router(invest_router)
app.include_router(schedules_router)
app.include_router(events_router)


@app.on_event("startup")
async def startup():
    from backend.database import engine, Base
    import backend.models  # noqa: ensure all models are imported before create_all
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    scheduler.start()
    await load_all_jobs()
    logging.getLogger(__name__).info("Application started")


@app.on_event("shutdown")
async def shutdown():
    scheduler.shutdown(wait=False)
    logging.getLogger(__name__).info("Application shutdown")


@app.get("/health")
async def health():
    return {"status": "ok", "version": "1.0"}
