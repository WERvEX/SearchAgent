from fastapi.testclient import TestClient


def test_health_endpoint_returns_ok(app_home):
    from app.main import create_app

    client = TestClient(create_app())

    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"ok": True}
