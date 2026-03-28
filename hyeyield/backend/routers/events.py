import asyncio
import json

from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse

from backend.services.sse import subscribe, unsubscribe
from backend.utils.jwt_utils import decode_token

router = APIRouter(tags=["events"])


@router.get("/events")
async def sse_events(token: str = Query(...)):
    """Server-Sent Events stream. Pass JWT as ?token= since EventSource
    does not support custom request headers."""
    user_id = decode_token(token)   # raises 401 HTTPException on bad token

    q = subscribe(user_id)

    async def event_stream():
        try:
            # Send a connected event so the client knows the connection is live
            yield f"data: {json.dumps({'type': 'connected'})}\n\n"
            while True:
                try:
                    data = await asyncio.wait_for(q.get(), timeout=25.0)
                    yield f"data: {json.dumps(data)}\n\n"
                except asyncio.TimeoutError:
                    # SSE comment keeps the connection alive through proxies
                    yield ": keepalive\n\n"
        finally:
            unsubscribe(user_id, q)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",   # tell nginx not to buffer SSE
            "Connection": "keep-alive",
        },
    )
