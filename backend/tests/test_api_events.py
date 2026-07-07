from fastapi.testclient import TestClient


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
