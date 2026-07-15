import json
import queue
import threading
from collections import deque
from collections.abc import Iterator
from typing import Any


class EventBus:
    """A bounded, in-process event stream with resumable subscriptions."""

    def __init__(self, *, history_size: int = 100) -> None:
        self._subscribers: set[queue.Queue[dict[str, Any]]] = set()
        self._history: deque[dict[str, Any]] = deque(maxlen=history_size)
        self._next_event_id = 1
        self._lock = threading.Lock()

    def publish(self, event: dict[str, Any]) -> dict[str, Any]:
        event_type = str(event.get("type", "message"))
        data = event.get("data")
        if data is None:
            data = {key: value for key, value in event.items() if key not in {"id", "type"}}

        with self._lock:
            published = {
                "id": str(self._next_event_id),
                "type": event_type,
                "data": data,
            }
            self._next_event_id += 1
            self._history.append(published)
            subscribers = list(self._subscribers)
        for subscriber in subscribers:
            subscriber.put(published)
        return published

    def subscribe(
        self,
        *,
        last_event_id: str | None = None,
        replay_limit: int | None = None,
    ) -> Iterator[dict[str, Any]]:
        subscriber: queue.Queue[dict[str, Any]] = queue.Queue()
        with self._lock:
            history = [
                event
                for event in self._history
                if last_event_id is None or _is_after(event["id"], last_event_id)
            ]
            if replay_limit is not None:
                history = history[-max(0, replay_limit):]
            self._subscribers.add(subscriber)
        try:
            yield from history
            while True:
                yield subscriber.get()
        finally:
            with self._lock:
                self._subscribers.discard(subscriber)


def _is_after(event_id: str, last_event_id: str) -> bool:
    try:
        return int(event_id) > int(last_event_id)
    except ValueError:
        return event_id != last_event_id


_BUS = EventBus()


def get_event_bus() -> EventBus:
    return _BUS


def format_sse(event: dict[str, Any]) -> str:
    event_id = str(event["id"]).replace("\n", "").replace("\r", "")
    event_type = str(event["type"]).replace("\n", "").replace("\r", "")
    data = json.dumps(event["data"], ensure_ascii=False, separators=(",", ":"))
    return f"id: {event_id}\nevent: {event_type}\ndata: {data}\n\n"
