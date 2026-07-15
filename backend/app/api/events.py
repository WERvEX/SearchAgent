from collections.abc import Iterator

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from app.core.events import format_sse, get_event_bus

router = APIRouter(tags=["events"])


@router.get("/events")
def stream_events(
    request: Request,
    replay_limit: int | None = None,
    limit: int | None = None,
):
    replay_limit = replay_limit if replay_limit is not None else limit
    last_event_id = request.headers.get("last-event-id")

    def body() -> Iterator[str]:
        for event in get_event_bus().subscribe(
            last_event_id=last_event_id,
            replay_limit=replay_limit,
        ):
            yield format_sse(event)

    return StreamingResponse(
        body(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
