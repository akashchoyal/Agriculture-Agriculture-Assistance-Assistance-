"""Iteration 6 — Voice Chat (Whisper STT + OpenAI TTS) + regression suite."""
import os
import io
import math
import time
import wave
import struct
import pytest
import requests
from motor.motor_asyncio import AsyncIOMotorClient
import asyncio

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://krishiai-preview-2.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
QA_EMAIL = "qa@krishiai.app"
QA_PASSWORD = "KrishiAI123!"


# ---------------- Fixtures ----------------
@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    return s


@pytest.fixture(scope="module")
def token(session):
    r = session.post(f"{API}/auth/login", json={"email": QA_EMAIL, "password": QA_PASSWORD})
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()["session_token"]


@pytest.fixture(scope="module")
def auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


def _make_wav(seconds: float = 1.5, freq: int = 440, sample_rate: int = 16000) -> bytes:
    """Return an in-memory 16-bit PCM mono WAV containing a sine tone."""
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sample_rate)
        n = int(seconds * sample_rate)
        frames = b"".join(
            struct.pack("<h", int(0.3 * 32767 * math.sin(2 * math.pi * freq * i / sample_rate)))
            for i in range(n)
        )
        w.writeframes(frames)
    return buf.getvalue()


# ---------------- Auth regression ----------------
class TestAuthRegression:
    def test_login_success(self, session):
        r = session.post(f"{API}/auth/login", json={"email": QA_EMAIL, "password": QA_PASSWORD})
        assert r.status_code == 200
        data = r.json()
        assert "session_token" in data and data["user"]["email"] == QA_EMAIL

    def test_me(self, session, auth_headers):
        r = session.get(f"{API}/auth/me", headers=auth_headers)
        assert r.status_code == 200
        assert r.json()["email"] == QA_EMAIL


# ---------------- Voice Chat: /api/ai/voice-chat ----------------
class TestVoiceChat:
    def test_missing_token_returns_401(self, session):
        wav = _make_wav(0.5)
        files = {"audio": ("recording.wav", wav, "audio/wav")}
        r = session.post(f"{API}/ai/voice-chat", files=files, data={"language": "en"})
        assert r.status_code == 401

    def test_unsupported_content_type_returns_415(self, session, auth_headers):
        files = {"audio": ("notes.txt", b"hello world", "text/plain")}
        r = session.post(f"{API}/ai/voice-chat", files=files, data={"language": "en"}, headers=auth_headers)
        assert r.status_code == 415

    def test_empty_body_returns_400(self, session, auth_headers):
        files = {"audio": ("empty.wav", b"", "audio/wav")}
        r = session.post(f"{API}/ai/voice-chat", files=files, data={"language": "en"}, headers=auth_headers)
        assert r.status_code == 400

    def test_oversized_returns_413(self, session, auth_headers):
        # 21MB dummy WAV-typed payload
        big = b"\x00" * (21 * 1024 * 1024)
        files = {"audio": ("big.wav", big, "audio/wav")}
        r = session.post(f"{API}/ai/voice-chat", files=files, data={"language": "en"}, headers=auth_headers)
        assert r.status_code == 413

    def test_voice_chat_success(self, session, auth_headers):
        # Use the app's own TTS to synthesise a real spoken MP3, then feed it
        # back through /ai/voice-chat so Whisper has actual speech to transcribe.
        tts_r = session.post(
            f"{API}/ai/tts",
            json={"text": "How do I protect my wheat crop from rust disease?", "language": "en"},
            headers=auth_headers, timeout=60,
        )
        assert tts_r.status_code == 200, f"TTS setup failed: {tts_r.status_code} {tts_r.text}"
        audio_get = session.get(f"{BASE_URL}{tts_r.json()['audio_url']}", timeout=30)
        assert audio_get.status_code == 200 and len(audio_get.content) > 1000
        mp3_bytes = audio_get.content

        files = {"audio": ("recording.mp3", mp3_bytes, "audio/mpeg")}
        r = session.post(
            f"{API}/ai/voice-chat", files=files, data={"language": "en"}, headers=auth_headers, timeout=120
        )
        if r.status_code in (422, 502):
            pytest.skip(f"Whisper transcription upstream issue: {r.status_code} {r.text[:200]}")
        assert r.status_code == 200, f"expected 200, got {r.status_code}: {r.text[:400]}"
        data = r.json()
        assert isinstance(data.get("transcript"), str) and data["transcript"].strip() != ""
        assert isinstance(data.get("reply"), str) and data["reply"].strip() != ""
        assert data.get("audio_url", "").startswith("/api/ai/voice/")
        assert data.get("language") in ("hi", "en")

        # Fetch the audio_url and check content-type
        audio_r = session.get(f"{BASE_URL}{data['audio_url']}", timeout=30)
        assert audio_r.status_code == 200
        assert audio_r.headers.get("content-type", "").startswith("audio/mpeg")
        assert len(audio_r.content) > 500  # non-empty mp3
        # Persist ID for chat_messages check
        pytest.voice_transcript = data["transcript"]
        pytest.voice_reply = data["reply"]


# ---------------- TTS: /api/ai/tts ----------------
class TestTTS:
    def test_tts_requires_auth(self, session):
        r = session.post(f"{API}/ai/tts", json={"text": "Hello", "language": "en"})
        assert r.status_code == 401

    def test_tts_empty_text_422(self, session, auth_headers):
        r = session.post(f"{API}/ai/tts", json={"text": "", "language": "en"}, headers=auth_headers)
        assert r.status_code == 422

    def test_tts_success_and_cache(self, session, auth_headers):
        payload = {"text": "TEST cache check for KrishiAI voice.", "language": "en"}
        r1 = session.post(f"{API}/ai/tts", json=payload, headers=auth_headers, timeout=60)
        assert r1.status_code == 200, r1.text
        url1 = r1.json().get("audio_url", "")
        assert url1.startswith("/api/ai/voice/") and url1.endswith(".mp3")

        # GET the audio
        audio_r = session.get(f"{BASE_URL}{url1}", timeout=30)
        assert audio_r.status_code == 200
        assert audio_r.headers.get("content-type", "").startswith("audio/mpeg")
        assert len(audio_r.content) > 500

        # Second call with same text+lang => same URL (cache hit)
        r2 = session.post(f"{API}/ai/tts", json=payload, headers=auth_headers, timeout=60)
        assert r2.status_code == 200
        url2 = r2.json().get("audio_url", "")
        assert url2 == url1, f"TTS cache miss: {url1} vs {url2}"

    def test_tts_hindi(self, session, auth_headers):
        payload = {"text": "नमस्ते किसान भाई।", "language": "hi"}
        r = session.post(f"{API}/ai/tts", json=payload, headers=auth_headers, timeout=60)
        assert r.status_code == 200
        assert r.json().get("audio_url", "").endswith(".mp3")


# ---------------- chat_messages persistence for voice modality ----------------
class TestChatMessagesPersistence:
    def test_voice_messages_persisted(self, auth_headers):
        """Only meaningful if TestVoiceChat.test_voice_chat_success recorded a transcript."""
        transcript = getattr(pytest, "voice_transcript", None)
        reply = getattr(pytest, "voice_reply", None)
        if not transcript or not reply:
            pytest.skip("Voice chat did not persist a transcript in this run.")

        async def _check():
            mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
            db_name = os.environ.get("DB_NAME", "test_database")
            cli = AsyncIOMotorClient(mongo_url)
            try:
                db = cli[db_name]
                # find any recent voice messages
                docs = await db.chat_messages.find(
                    {"modality": "voice"},
                    {"_id": 0}
                ).sort("created_at", -1).limit(10).to_list(10)
                roles = {d["role"] for d in docs}
                assert "user" in roles and "assistant" in roles, f"missing roles in voice chat_messages: {roles}"
                # transcript should appear in a user row
                assert any(d.get("content") == transcript and d.get("role") == "user" for d in docs), \
                    f"user voice message with transcript not found: {transcript}"
                assert any(d.get("role") == "assistant" and d.get("modality") == "voice" for d in docs)
            finally:
                cli.close()

        asyncio.run(_check())


# ---------------- Existing endpoint regression ----------------
class TestRegression:
    def test_chat_still_works(self, session, auth_headers):
        r = session.post(
            f"{API}/ai/chat",
            json={"message": "TEST regression: name one wheat fertilizer.", "language": "en"},
            headers=auth_headers, timeout=60,
        )
        assert r.status_code == 200
        assert isinstance(r.json().get("reply"), str) and r.json()["reply"].strip()

    def test_scan_history_get(self, session, auth_headers):
        r = session.get(f"{API}/scan/history", headers=auth_headers)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_weather(self, session, auth_headers):
        r = session.get(f"{API}/weather", headers=auth_headers, timeout=20)
        assert r.status_code == 200
        data = r.json()
        assert data.get("location") and isinstance(data.get("forecast"), list)

    def test_mandi(self, session, auth_headers):
        r = session.get(f"{API}/mandi", headers=auth_headers, timeout=20)
        assert r.status_code == 200
        data = r.json()
        assert data.get("source") in ("live", "msp") and isinstance(data.get("items"), list)
        assert len(data["items"]) > 0

    def test_profile_patch(self, session, auth_headers):
        r = session.patch(
            f"{API}/profile",
            json={"address": "TEST_iter6_voice"},
            headers=auth_headers, timeout=15,
        )
        assert r.status_code == 200
        assert r.json()["address"] == "TEST_iter6_voice"

    def test_scan_endpoint_unchanged_signature(self, session, auth_headers):
        # Do not consume LLM quota; verify shape via 400 for bad base64
        r = session.post(
            f"{API}/ai/scan",
            json={"image_base64": "not-base64", "mime_type": "image/jpeg", "language": "en"},
            headers=auth_headers,
        )
        # Should reject invalid base64 with 400
        assert r.status_code in (400, 422)
