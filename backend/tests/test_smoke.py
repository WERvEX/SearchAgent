def test_python_and_imports():
    import sqlalchemy
    import cryptography
    import pydantic

    assert sqlalchemy.__version__.startswith("2.")
