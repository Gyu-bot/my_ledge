"""Human-managed one-off expense events."""

from typing import Annotated

from fastapi import APIRouter, Depends, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db_session
from app.core.security import require_api_key
from app.schemas.one_off_event import (
    OneOffEventCreate,
    OneOffEventDetail,
    OneOffEventMembersRequest,
    OneOffEventPatch,
    OneOffEventSummary,
)
from app.services import one_off_event_service as events

router = APIRouter(prefix="/one-off-events")
Database = Annotated[AsyncSession, Depends(get_db_session)]
write_auth = [Depends(require_api_key)]


@router.get("")
async def list_events(db: Database) -> list[OneOffEventSummary]:
    return await events.list_events(db)


@router.get("/{event_id}")
async def get_event(event_id: int, db: Database) -> OneOffEventDetail:
    return await events.get_event(db, event_id)


@router.post("", status_code=201, dependencies=write_auth)
async def create_event(payload: OneOffEventCreate, db: Database) -> OneOffEventDetail:
    return await events.create_event(db, payload)


@router.patch("/{event_id}", dependencies=write_auth)
async def update_event(
    event_id: int, payload: OneOffEventPatch, db: Database
) -> OneOffEventDetail:
    return await events.update_event(db, event_id, payload)


@router.delete("/{event_id}", status_code=204, dependencies=write_auth)
async def delete_event(event_id: int, db: Database) -> Response:
    await events.delete_event(db, event_id)
    return Response(status_code=204)


@router.post("/{event_id}/members", dependencies=write_auth)
async def add_members(
    event_id: int, payload: OneOffEventMembersRequest, db: Database
) -> OneOffEventDetail:
    return await events.add_members(db, event_id, payload.transaction_ids)


@router.delete("/{event_id}/members", dependencies=write_auth)
async def remove_members(
    event_id: int, payload: OneOffEventMembersRequest, db: Database
) -> OneOffEventDetail:
    return await events.remove_members(db, event_id, payload.transaction_ids)
