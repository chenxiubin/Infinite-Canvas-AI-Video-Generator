"""Sprint 11C: Provider API routes."""

import sqlite3
from fastapi import APIRouter, HTTPException, Depends
from app.db.connection import get_db
from app.providers.registry import list_providers, get_provider

router = APIRouter(prefix="/api/v1/providers", tags=["providers"])


@router.get("")
def list_all():
    return [{"name": n, "enabled": True} for n in list_providers()]


@router.get("/{name}/health")
def health(name: str):
    try:
        get_provider(name)
        return {"status": "ok", "provider": name}
    except ValueError:
        raise HTTPException(status_code=404, detail=f"Unknown provider: {name}")
