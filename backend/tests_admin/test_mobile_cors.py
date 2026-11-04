import pytest


@pytest.mark.parametrize("origin", [
    "https://localhost", "http://localhost:5173", "http://127.0.0.1:5173",
])
def test_allowed_clients_can_preflight_bearer_requests(client, origin):
    response = client.options("/tickets", headers={
        "Origin": origin,
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "authorization,content-type",
    })
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == origin


def test_unlisted_origin_is_rejected(client):
    response = client.options("/tickets", headers={
        "Origin": "https://untrusted.example",
        "Access-Control-Request-Method": "GET",
    })
    assert response.status_code == 400
    assert "access-control-allow-origin" not in response.headers
