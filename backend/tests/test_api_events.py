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
