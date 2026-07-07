import json
import queue
from collections.abc import Iterator
from typing import Any


class EventBus:
    def __init__(self) -> None:
        self._queue: queue.Queue[dict[str, Any]] = queue.Queue()

    def publish(self, event: dict[str, Any]) -> None:
        self._queue.put(event)

    def subscribe(self, *, limit: int | None = None) -> Iterator[dict[str, Any]]:
        count = 0
        while limit is None or count < limit:
            yield self._queue.get()
            count += 1


_BUS = EventBus()


def get_event_bus() -> EventBus:
    return _BUS


def format_sse(event: dict[str, Any]) -> str:
    return f"data: {json.dumps(event, ensure_ascii=False, separators=(',', ':'))}\n\n"
