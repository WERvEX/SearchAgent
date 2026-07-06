def test_create_checkpointer_returns_usable_saver(app_home):
    from app.engine import checkpointer

    saver = checkpointer.create_checkpointer()
    assert saver is not None
    assert hasattr(saver, "conn") or hasattr(saver, "setup")
