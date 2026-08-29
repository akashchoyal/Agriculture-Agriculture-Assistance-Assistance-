import base64
import os
import re
from pathlib import Path

import pytest
import requests
from dotenv import load_dotenv


# Load frontend env so tests always hit public URL seen by users
load_dotenv(Path("/app/frontend/.env"))

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
QA_EMAIL = "qa@krishiai.app"
QA_PASSWORD = "KrishiAI123!"
KARELA_IMAGE = Path("/tmp/karela_powdery_mildew.png")


@pytest.fixture(scope="session")
def api_client():
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture(scope="session")
def auth_token(api_client):
    if not BASE_URL:
        pytest.skip("EXPO_PUBLIC_BACKEND_URL missing")
    response = api_client.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": QA_EMAIL, "password": QA_PASSWORD},
        timeout=45,
    )
    if response.status_code != 200:
        pytest.skip(f"Login failed: {response.status_code} {response.text}")
    data = response.json()
    return data["session_token"]


@pytest.fixture(scope="session")
def karela_data_uri():
    if not KARELA_IMAGE.exists():
        pytest.skip("Missing test image /tmp/karela_powdery_mildew.png")
    encoded = base64.b64encode(KARELA_IMAGE.read_bytes()).decode("utf-8")
    return f"data:image/png;base64,{encoded}"


# Auth and MIME validation checks for scanner API
def test_scan_requires_auth(api_client, karela_data_uri):
    response = api_client.post(
        f"{BASE_URL}/api/ai/scan",
        json={"image_base64": karela_data_uri, "mime_type": "image/png", "language": "hi"},
        timeout=60,
    )
    assert response.status_code == 401


def test_scan_rejects_invalid_base64(api_client, auth_token):
    response = api_client.post(
        f"{BASE_URL}/api/ai/scan",
        headers={"Authorization": f"Bearer {auth_token}"},
        json={
            "image_base64": "data:image/png;base64,not-valid-base64$$$",
            "mime_type": "image/png",
            "language": "hi",
        },
        timeout=60,
    )
    assert response.status_code == 400
    assert "Invalid base64 image" in response.text


def test_scan_rejects_unsupported_data_uri_mime(api_client, auth_token):
    tiny_payload = base64.b64encode(b"BMFAKE").decode("utf-8")
    response = api_client.post(
        f"{BASE_URL}/api/ai/scan",
        headers={"Authorization": f"Bearer {auth_token}"},
        json={
            "image_base64": f"data:image/bmp;base64,{tiny_payload}",
            "mime_type": "image/bmp",
            "language": "hi",
        },
        timeout=60,
    )
    assert response.status_code == 400


# Vegetable disease diagnosis checks using real karela image
def test_scan_karela_with_hint_returns_expected_fields(api_client, auth_token, karela_data_uri):
    response = api_client.post(
        f"{BASE_URL}/api/ai/scan",
        headers={"Authorization": f"Bearer {auth_token}"},
        json={
            "image_base64": karela_data_uri,
            "mime_type": "image/png",
            "language": "hi",
            "plant_hint": "करेला",
        },
        timeout=90,
    )
    assert response.status_code == 200, response.text
    data = response.json()

    assert data.get("plant_name")
    assert data.get("plant_category")
    assert data.get("diagnosis")
    assert data.get("confidence")
    assert data.get("severity")
    assert isinstance(data.get("symptoms"), list) and len(data["symptoms"]) >= 2
    assert isinstance(data.get("causes"), list) and len(data["causes"]) >= 1
    assert isinstance(data.get("remedies"), list) and len(data["remedies"]) >= 2
    assert "gemini" in (data.get("model_used") or "").lower()

    plant_name = data.get("plant_name", "").lower()
    assert ("करेला" in plant_name) or ("bitter" in plant_name and "gourd" in plant_name)

    # Devanagari check on Hindi values
    devanagari_pattern = re.compile(r"[\u0900-\u097F]")
    assert devanagari_pattern.search(data.get("diagnosis", ""))
    assert devanagari_pattern.search(data.get("confidence", ""))
    assert devanagari_pattern.search(data.get("severity", ""))


def test_scan_karela_without_hint_still_returns_conservative_output(api_client, auth_token, karela_data_uri):
    response = api_client.post(
        f"{BASE_URL}/api/ai/scan",
        headers={"Authorization": f"Bearer {auth_token}"},
        json={
            "image_base64": karela_data_uri,
            "mime_type": "image/png",
            "language": "hi",
            "plant_hint": "",
        },
        timeout=90,
    )
    assert response.status_code == 200, response.text
    data = response.json()
    assert data.get("plant_name")
    assert data.get("diagnosis")
    assert data.get("confidence")


# Scan history persistence and backward-compat readability checks
def test_scan_history_contains_new_fields(api_client, auth_token):
    response = api_client.get(
        f"{BASE_URL}/api/scan/history",
        headers={"Authorization": f"Bearer {auth_token}"},
        timeout=45,
    )
    assert response.status_code == 200, response.text
    history = response.json()
    assert isinstance(history, list)

    if not history:
        pytest.skip("No scan history returned")

    first = history[0]
    assert "scan_id" in first
    assert "diagnosis" in first
    assert "confidence" in first
    assert "symptoms" in first
    assert "remedies" in first

    # New vegetable-related fields should be present in recent docs
    assert "plant_name" in first
    assert "plant_category" in first
    assert "causes" in first
    assert "severity" in first
