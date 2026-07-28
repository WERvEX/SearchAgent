import asyncio
import contextlib
import threading
from collections.abc import AsyncIterator, Iterator

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from app.core.events import format_sse, get_event_bus

router = APIRouter(tags=["events"])


@router.get("/events")
def stream_events(
    request: Request,
    thread_id: str | None = None,
    conversation_id: int | None = None,
    replay_limit: int | None = None,
    limit: int | None = None,
):
    replay_limit = replay_limit if replay_limit is not None else limit
    last_event_id = request.headers.get("last-event-id")

    def matches_event(event: dict) -> bool:
        data = event.get("data")
        if not isinstance(data, dict):
            return False
        if thread_id is not None and data.get("thread_id") != thread_id:
            return False
        return conversation_id is None or data.get("conversation_id") == conversation_id

    async def body() -> AsyncIterator[str]:
        disconnected = threading.Event()
        subscription = get_event_bus().subscribe(
            last_event_id=last_event_id,
            replay_limit=replay_limit,
            event_filter=matches_event,
            stop_event=disconnected,
        )

        async def watch_disconnect() -> None:
            while not disconnected.is_set():
                try:
                    is_disconnected = await request.is_disconnected()
                except RuntimeError:
                    # Direct generator callers may not provide Starlette's receive channel.
                    return
                if is_disconnected:
                    disconnected.set()
                    return
                await asyncio.sleep(0.05)

        watcher = asyncio.create_task(watch_disconnect())
        try:
            # Flush response headers immediately so EventSource reports an open
            # connection even when no lifecycle event is currently available.
            yield ": connected\n\n"
            while not disconnected.is_set():
                has_event, event = await asyncio.to_thread(_next_event, subscription)
                if not has_event:
                    break
                yield format_sse(event)
        finally:
            disconnected.set()
            watcher.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await watcher

    return StreamingResponse(
        body(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


def _next_event(subscription: Iterator[dict]) -> tuple[bool, dict | None]:
    try:
        return True, next(subscription)
    except StopIteration:
        return False, None
