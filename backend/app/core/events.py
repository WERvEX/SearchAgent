import json
import queue
import threading
from collections import deque
from collections.abc import Iterator
from typing import Any


class EventBus:
    def __init__(self, *, history_size: int = 100) -> None:
        self._subscribers: set[queue.Queue[dict[str, Any]]] = set()
        self._history: deque[dict[str, Any]] = deque(maxlen=history_size)
        self._lock = threading.Lock()

    def publish(self, event: dict[str, Any]) -> None:
        with self._lock:
            self._history.append(event)
            subscribers = list(self._subscribers)
        for subscriber in subscribers:
            subscriber.put(event)

    def subscribe(self, *, limit: int | None = None) -> Iterator[dict[str, Any]]:
        subscriber: queue.Queue[dict[str, Any]] = queue.Queue()
        with self._lock:
            history = list(self._history)
            self._subscribers.add(subscriber)
        for event in history:
            subscriber.put(event)
        count = 0
        try:
            while limit is None or count < limit:
                yield subscriber.get()
                count += 1
        finally:
            with self._lock:
                self._subscribers.discard(subscriber)


_BUS = EventBus()


def get_event_bus() -> EventBus:
    return _BUS


def format_sse(event: dict[str, Any]) -> str:
    return f"data: {json.dumps(event, ensure_ascii=False, separators=(',', ':'))}\n\n"
