from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.routers.auth import router as auth_router
from backend.routers.schwab import router as schwab_router
from backend.routers.invest import router as invest_router
from backend.services.scheduler import scheduler, load_all_jobs

app = FastAPI(title="Hye-Yield", version="1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "https://hyeyield.duckdns.org",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(auth_router)
app.include_router(schwab_router)
app.include_router(invest_router)


@app.on_event("startup")
async def startup():
    scheduler.start()
    await load_all_jobs()


@app.on_event("shutdown")
async def shutdown():
    scheduler.shutdown(wait=False)


@app.get("/health")
async def health():
    return {"status": "ok", "version": "1.0"}
