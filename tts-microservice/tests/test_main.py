
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def test_read_root():
    response = client.get("/")
    assert response.status_code == 200
    assert response.json()["service"] == "DxAi TTS Microservice"

def test_health_check():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    assert "sarvam" in response.json()

def test_synthesize_unauthorized():
    # Attempting to access synthesize without API key should fail
    response = client.post("/synthesize", json={"text": "Hello", "language": "eng"})
    assert response.status_code == 401
    assert "invalid api key" in response.json()["detail"].lower()
