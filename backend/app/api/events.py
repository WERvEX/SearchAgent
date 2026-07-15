from collections.abc import Iterator

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from app.core.events import format_sse, get_event_bus

router = APIRouter(tags=["events"])


@router.get("/events")
def stream_events(
    request: Request,
    thread_id: str | None = None,
    replay_limit: int | None = None,
    limit: int | None = None,
):
    replay_limit = replay_limit if replay_limit is not None else limit
    last_event_id = request.headers.get("last-event-id")

    def matches_thread(event: dict) -> bool:
        if thread_id is None:
            return True
        data = event.get("data")
        return isinstance(data, dict) and data.get("thread_id") == thread_id

    def body() -> Iterator[str]:
        for event in get_event_bus().subscribe(
            last_event_id=last_event_id,
            replay_limit=replay_limit,
            event_filter=matches_thread,
        ):
            yield format_sse(event)

    return StreamingResponse(
        body(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
