import asyncio
import time

import pytest


def _read_sse_chunk(response):
    async def read():
        iterator = response.body_iterator
        try:
            return await anext(iterator)
        finally:
            await iterator.aclose()

    return asyncio.run(read())


def test_event_bus_broadcasts_to_each_subscriber(app_home):
    import queue
    import threading

    from app.core.events import EventBus

    bus = EventBus()
    first = bus.subscribe()
    second = bus.subscribe()
    received = queue.Queue()

    published = bus.publish({"type": "research.progress", "data": {"message": "running"}})

    def collect(name, iterator):
        received.put((name, next(iterator)))

    threads = [
        threading.Thread(target=collect, args=("first", first), daemon=True),
        threading.Thread(target=collect, args=("second", second), daemon=True),
    ]
    for thread in threads:
        thread.start()

    results = [received.get(timeout=1)]
    try:
        results.append(received.get(timeout=1))
    except queue.Empty:
        pass

    assert sorted(results) == [
        ("first", published),
        ("second", published),
    ]


def test_event_bus_formats_sse_messages(app_home):
    from app.core.events import format_sse

    assert format_sse(
        {"id": "7", "type": "research.progress", "data": {"message": "running"}}
    ) == (
        'id: 7\nevent: research.progress\ndata: {"message":"running"}\n\n'
    )


def test_event_bus_replays_only_events_after_last_event_id_and_stays_live(app_home):
    from app.core.events import EventBus

    bus = EventBus(history_size=10)
    first = bus.publish({"type": "research.started", "data": {"run_id": "run-1"}})
    second = bus.publish({"type": "research.plan_ready", "data": {"run_id": "run-1"}})

    subscriber = bus.subscribe(last_event_id=first["id"], replay_limit=1)
    assert next(subscriber) == second

    third = bus.publish({"type": "research.completed", "data": {"run_id": "run-1"}})
    assert next(subscriber) == third


def test_event_bus_with_zero_replay_only_receives_new_events(app_home):
    from queue import Queue
    from threading import Thread
    from time import sleep

    from app.core.events import EventBus

    bus = EventBus(history_size=10)
    bus.publish({"type": "research.started", "data": {"run_id": "old"}})
    subscriber = bus.subscribe(replay_limit=0)
    received: Queue[dict] = Queue()
    reader = Thread(target=lambda: received.put(next(subscriber)), daemon=True)
    reader.start()
    for _ in range(100):
        if bus._subscribers:
            break
        sleep(0.01)
    assert bus._subscribers

    live = bus.publish({"type": "research.started", "data": {"run_id": "new"}})

    assert received.get(timeout=1) == live
    reader.join(timeout=1)


def test_event_bus_drops_old_events_for_a_slow_subscriber(app_home):
    from queue import Queue
    from threading import Thread
    from time import sleep

    from app.core.events import EventBus

    bus = EventBus(history_size=2)
    subscriber = bus.subscribe(replay_limit=0)
    received: Queue[dict] = Queue()
    reader = Thread(target=lambda: received.put(next(subscriber)), daemon=True)
    reader.start()
    for _ in range(100):
        if bus._subscribers:
            break
        sleep(0.01)
    assert bus._subscribers

    first = bus.publish({"type": "research.progress", "data": {"seq": 1}})
    assert received.get(timeout=1) == first

    queued = next(iter(bus._subscribers))
    second = bus.publish({"type": "research.progress", "data": {"seq": 2}})
    third = bus.publish({"type": "research.progress", "data": {"seq": 3}})
    fourth = bus.publish({"type": "research.progress", "data": {"seq": 4}})

    assert queued.maxsize == 2
    assert [queued.get_nowait(), queued.get_nowait()] == [third, fourth]
    assert second["id"] < third["id"] < fourth["id"]
    subscriber.close()


def test_event_bus_filters_replay_and_live_events_by_thread_id(app_home):
    from app.core.events import EventBus

    bus = EventBus(history_size=10)
    ignored = bus.publish({"type": "research.started", "data": {"thread_id": "other-thread"}})
    matching = bus.publish({"type": "research.plan_ready", "data": {"thread_id": "thread-1"}})

    subscriber = bus.subscribe(event_filter=lambda event: event["data"].get("thread_id") == "thread-1")
    assert next(subscriber) == matching

    bus.publish({"type": "research.completed", "data": {"thread_id": "other-thread"}})
    live = bus.publish({"type": "research.completed", "data": {"thread_id": "thread-1"}})
    assert next(subscriber) == live
    assert ignored["id"] < matching["id"] < live["id"]


def test_stream_events_filters_replay_by_thread_and_conversation_id(app_home, monkeypatch):
    from fastapi import Request

    from app.api import events as events_api
    from app.core.events import EventBus

    bus = EventBus(history_size=10)
    bus.publish({"type": "research.started", "data": {"thread_id": "other", "conversation_id": 9}})
    bus.publish({"type": "research.started", "data": {"thread_id": "thread-1", "conversation_id": 9}})
    bus.publish({"type": "research.started", "data": {"thread_id": "other", "conversation_id": 4}})
    matching = bus.publish({"type": "research.plan_ready", "data": {"thread_id": "thread-1", "conversation_id": 4}})
    monkeypatch.setattr(events_api, "get_event_bus", lambda: bus)

    request = Request({"type": "http", "method": "GET", "path": "/events", "headers": [(b"last-event-id", b"1")]})
    response = events_api.stream_events(request, thread_id="thread-1", conversation_id=4)

    assert _read_sse_chunk(response) == (
        f'id: {matching["id"]}\nevent: research.plan_ready\ndata: {{"thread_id":"thread-1","conversation_id":4}}\n\n'
    )
    assert not bus._subscribers


def test_stream_events_releases_idle_subscription_after_disconnect(app_home, monkeypatch):
    from app.api import events as events_api
    from app.core.events import EventBus

    bus = EventBus()
    monkeypatch.setattr(events_api, "get_event_bus", lambda: bus)

    class DisconnectAfterSubscription:
        headers = {}

        async def is_disconnected(self):
            return bool(bus._subscribers)

    async def consume_until_disconnect():
        response = events_api.stream_events(DisconnectAfterSubscription(), conversation_id=4)
        iterator = response.body_iterator
        try:
            with pytest.raises(StopAsyncIteration):
                await anext(iterator)
        finally:
            await iterator.aclose()

    started_at = time.monotonic()
    asyncio.run(consume_until_disconnect())

    assert time.monotonic() - started_at < 1
    assert not bus._subscribers
