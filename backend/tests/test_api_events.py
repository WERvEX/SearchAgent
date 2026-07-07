from fastapi.testclient import TestClient


def test_event_bus_broadcasts_to_each_subscriber(app_home):
    import queue
    import threading

    from app.core.events import EventBus

    bus = EventBus()
    first = bus.subscribe(limit=1)
    second = bus.subscribe(limit=1)
    received = queue.Queue()

    bus.publish({"type": "progress", "message": "running"})

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
        ("first", {"type": "progress", "message": "running"}),
        ("second", {"type": "progress", "message": "running"}),
    ]


def test_event_bus_formats_sse_messages(app_home):
    from app.core.events import format_sse

    assert format_sse({"type": "progress", "message": "running"}) == (
        'data: {"type":"progress","message":"running"}\n\n'
    )


def test_events_endpoint_streams_published_event(app_home):
    from app.core.events import get_event_bus
    from app.main import create_app

    bus = get_event_bus()
    bus.publish({"type": "progress", "message": "running"})

    client = TestClient(create_app())
    with client.stream("GET", "/events?limit=1") as response:
        body = next(response.iter_text())

    assert response.status_code == 200
    assert '"type":"progress"' in body
