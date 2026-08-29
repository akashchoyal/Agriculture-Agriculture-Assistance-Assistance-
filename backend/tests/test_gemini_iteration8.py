"""Iteration 8 backend tests: Gemini primary flows, scan persistence, fallback isolation, and voice contract."""

import asyncio
import base64
import os
import re
import sys
from pathlib import Path

import pytest
import requests
from dotenv import dotenv_values


# Module: public base URL resolution from environment only
BASE_URL = (
    os.environ.get("EXPO_BACKEND_URL")
    or os.environ.get("EXPO_PUBLIC_BACKEND_URL")
    or dotenv_values("/app/frontend/.env").get("EXPO_BACKEND_URL")
    or dotenv_values("/app/frontend/.env").get("EXPO_PUBLIC_BACKEND_URL")
    or ""
).rstrip("/")

# Module: QA auth credentials for authenticated API scenarios
QA_EMAIL = "qa@krishiai.app"
QA_PASSWORD = "KrishiAI123!"


@pytest.fixture(scope="session")
def api_client() -> requests.Session:
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture(scope="session")
def auth_headers(api_client: requests.Session):
    if not BASE_URL:
        pytest.skip("Public backend URL is not configured")
    login = api_client.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": QA_EMAIL, "password": QA_PASSWORD},
        timeout=30,
    )
    if login.status_code != 200:
        pytest.skip(f"Auth failed for QA account: {login.status_code} {login.text[:200]}")
    token = login.json().get("session_token")
    if not token:
        pytest.skip("Auth returned no session token")
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture()
def created_scan_ids(api_client: requests.Session, auth_headers):
    ids = []
    yield ids
    for scan_id in ids:
        api_client.delete(f"{BASE_URL}/api/scan/history/{scan_id}", headers=auth_headers, timeout=30)


# Module: /api/ai/chat Gemini model and bilingual response behavior
def test_chat_returns_hindi_with_gemini_model(api_client: requests.Session, auth_headers):
    response = api_client.post(
        f"{BASE_URL}/api/ai/chat",
        headers=auth_headers,
        json={"message": "गेहूं में जंग रोग से बचाव कैसे करें?", "language": "hi"},
        timeout=90,
    )
    assert response.status_code == 200, response.text
    data = response.json()
    assert data.get("model_used") == "gemini-3-flash-preview"
    assert isinstance(data.get("reply"), str) and len(data["reply"].strip()) >= 20
    assert (
        re.search(r"[\u0900-\u097F]", data["reply"]) is not None
        or re.search(r"\b(kisan|fasal|rog|bachav|krishi)\b", data["reply"].lower()) is not None
    )
    assert data.get("language") == "hi"


def test_chat_returns_english_with_gemini_model(api_client: requests.Session, auth_headers):
    response = api_client.post(
        f"{BASE_URL}/api/ai/chat",
        headers=auth_headers,
        json={"message": "How to reduce wheat rust risk this week?", "language": "en"},
        timeout=90,
    )
    assert response.status_code == 200, response.text
    data = response.json()
    assert data.get("model_used") == "gemini-3-flash-preview"
    assert isinstance(data.get("reply"), str) and len(data["reply"].strip()) >= 20
    assert re.search(r"[A-Za-z]", data["reply"]) is not None
    assert data.get("language") == "en"


# Module: /api/ai/scan real image response contract + model tagging
def test_scan_real_image_returns_expected_fields_and_gemini_model(
    api_client: requests.Session,
    auth_headers,
    created_scan_ids,
):
    image_path = Path("/tmp/gemini_crop_test.jpg")
    assert image_path.exists(), "Missing required test image: /tmp/gemini_crop_test.jpg"
    raw = image_path.read_bytes()
    image_b64 = base64.b64encode(raw).decode()
    payload = {
        "image_base64": f"data:image/jpeg;base64,{image_b64}",
        "mime_type": "image/jpeg",
        "language": "en",
    }
    response = api_client.post(
        f"{BASE_URL}/api/ai/scan",
        headers=auth_headers,
        json=payload,
        timeout=120,
    )
    assert response.status_code == 200, response.text
    data = response.json()
    assert data.get("model_used") == "gemini-3-flash-preview"
    assert isinstance(data.get("diagnosis"), str) and data["diagnosis"].strip()
    assert isinstance(data.get("confidence"), str) and data["confidence"].strip()
    assert isinstance(data.get("symptoms"), list) and len(data["symptoms"]) >= 2
    assert isinstance(data.get("remedies"), list) and len(data["remedies"]) >= 3
    assert data.get("scan_id", "").startswith("scan_")
    created_scan_ids.append(data["scan_id"])


def test_scan_history_persists_model_used_for_new_scan(
    api_client: requests.Session,
    auth_headers,
    created_scan_ids,
):
    image_path = Path("/tmp/gemini_crop_test.jpg")
    raw = image_path.read_bytes()
    image_b64 = base64.b64encode(raw).decode()
    create = api_client.post(
        f"{BASE_URL}/api/ai/scan",
        headers=auth_headers,
        json={"image_base64": f"data:image/jpeg;base64,{image_b64}", "mime_type": "image/jpeg", "language": "hi"},
        timeout=120,
    )
    assert create.status_code == 200, create.text
    created = create.json()
    scan_id = created["scan_id"]
    created_scan_ids.append(scan_id)

    history = api_client.get(f"{BASE_URL}/api/scan/history", headers=auth_headers, timeout=30)
    assert history.status_code == 200, history.text
    items = history.json()
    match = next((item for item in items if item.get("scan_id") == scan_id), None)
    assert match is not None, f"Scan {scan_id} not found in history"
    assert match.get("model_used") == "gemini-3-flash-preview"


# Module: ai_text provider fallback should switch to GPT when Gemini fails (isolated monkeypatch)
def test_ai_text_falls_back_to_gpt_when_primary_fails(monkeypatch):
    if "/app/backend" not in sys.path:
        sys.path.insert(0, "/app/backend")
    import server

    class FakeTextDelta:
        def __init__(self, content: str):
            self.content = content

    class FakeStreamDone:
        pass

    class FakeChat:
        def __init__(self, *args, **kwargs):
            self.model = ""

        def with_model(self, _provider: str, model: str):
            self.model = model
            return self

        async def stream_message(self, _message):
            if self.model == "gemini-3-flash-preview":
                raise RuntimeError("forced gemini failure")
            yield FakeTextDelta("fallback-ok")
            yield FakeStreamDone()

    monkeypatch.setenv("EMERGENT_LLM_KEY", "test-key")
    monkeypatch.setattr(server, "LlmChat", FakeChat)
    monkeypatch.setattr(server, "TextDelta", FakeTextDelta)
    monkeypatch.setattr(server, "StreamDone", FakeStreamDone)

    reply, model_used = asyncio.run(server.ai_text("test prompt", "iter8_fallback"))
    assert reply == "fallback-ok"
    assert model_used == "gpt-5.4"


# Module: /api/ai/voice-chat remains compatible with ai_text tuple -> model_used output contract
def test_voice_chat_response_contains_model_used(api_client: requests.Session, auth_headers):
    tts = api_client.post(
        f"{BASE_URL}/api/ai/tts",
        headers=auth_headers,
        json={"text": "Give one practical wheat irrigation tip", "language": "en"},
        timeout=60,
    )
    if tts.status_code != 200:
        pytest.skip(f"TTS unavailable for voice contract test: {tts.status_code} {tts.text[:200]}")

    audio_url = tts.json().get("audio_url", "")
    if not audio_url:
        pytest.skip("No audio_url returned by /api/ai/tts")

    audio = api_client.get(f"{BASE_URL}{audio_url}", timeout=30)
    if audio.status_code != 200 or len(audio.content) < 1000:
        pytest.skip(f"Unable to retrieve generated speech audio: {audio.status_code}")

    files = {"audio": ("iter8.mp3", audio.content, "audio/mpeg")}
    voice = requests.post(
        f"{BASE_URL}/api/ai/voice-chat",
        headers={"Authorization": auth_headers["Authorization"]},
        files=files,
        data={"language": "en"},
        timeout=120,
    )
    if voice.status_code in (422, 502):
        pytest.skip(f"Upstream transcription instability: {voice.status_code} {voice.text[:200]}")

    assert voice.status_code == 200, voice.text
    data = voice.json()
    assert isinstance(data.get("reply"), str) and data["reply"].strip()
    assert isinstance(data.get("model_used"), str) and data["model_used"].strip()
