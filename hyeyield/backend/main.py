from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from backend.routers.auth import router as auth_router
from backend.routers.schwab import router as schwab_router
from backend.routers.invest import router as invest_router
from backend.routers.schedules import router as schedules_router
from backend.routers.events import router as events_router
from backend.services.scheduler import scheduler, load_all_jobs
from backend.utils.limiter import limiter

app = FastAPI(title="Hye-Yield", version="1.0")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://hyeyield.duckdns.org",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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


@app.on_event("shutdown")
async def shutdown():
    scheduler.shutdown(wait=False)


@app.get("/health")
async def health():
    return {"status": "ok", "version": "1.0"}
