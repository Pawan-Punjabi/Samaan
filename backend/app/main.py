"""FastAPI entrypoint for the simplified Weekly Inventory & Reorder Flow."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.db import init_db
from app.routers import flow_router


@asynccontextmanager
async def lifespan(_: FastAPI):
    """Ensure database tables and workspace folder exist on startup."""
    init_db()
    yield


app = FastAPI(
    title="RetailFlow Reorder Studio",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root() -> dict[str, str]:
    """Provide entry points for the API when the server root is opened."""
    return {
        "name": app.title,
        "docs": "/docs",
        "health": f"{settings.api_prefix}/health",
    }


@app.get(f"{settings.api_prefix}/health")
def health() -> dict[str, str | int]:
    """Readiness probe confirming API availability."""
    return {"status": "ok", "version": 1}


app.include_router(flow_router, prefix=settings.api_prefix)
