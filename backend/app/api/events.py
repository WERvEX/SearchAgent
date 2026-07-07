from collections.abc import Iterator

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from app.core.events import format_sse, get_event_bus

router = APIRouter(tags=["events"])


@router.get("/events")
def stream_events(limit: int | None = None):
    def body() -> Iterator[str]:
        for event in get_event_bus().subscribe(limit=limit):
            yield format_sse(event)

    return StreamingResponse(body(), media_type="text/event-stream")
