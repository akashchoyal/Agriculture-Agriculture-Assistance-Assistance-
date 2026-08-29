"""
Backend tests for KrishiAI iteration 4 - Scan History feature.
Covers:
  - POST /api/ai/scan persists scan and returns scan_id
  - GET /api/scan/history returns latest non-deleted scans (excludes _id/user_id)
  - DELETE /api/scan/history/{id} soft-deletes; 404 for missing / other-user / already-deleted
  - Auth is required (401) for history endpoints
  - Startup index on scan_history (user_id asc, created_at desc) exists
"""
import base64
import os
import uuid

import pytest
import requests
from dotenv import dotenv_values
from pymongo import MongoClient

BASE_URL = (
    os.environ.get("EXPO_BACKEND_URL")
    or os.environ.get("EXPO_PUBLIC_BACKEND_URL")
    or dotenv_values("/app/frontend/.env").get("EXPO_PUBLIC_BACKEND_URL")
    or ""
).rstrip("/")

QA_EMAIL = "qa@krishiai.app"
QA_PASSWORD = "KrishiAI123!"

MONGO_URL = dotenv_values("/app/backend/.env").get("MONGO_URL")
DB_NAME = dotenv_values("/app/backend/.env").get("DB_NAME")


with open("/tmp/leaf.jpg", "rb") as fh:
    LEAF_B64 = base64.b64encode(fh.read()).decode()
LEAF_DATA_URI = f"data:image/jpeg;base64,{LEAF_B64}"


# ---------- fixtures ----------
@pytest.fixture(scope="session")
def token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": QA_EMAIL, "password": QA_PASSWORD},
        timeout=30,
    )
    assert r.status_code == 200, r.text
    return r.json()["session_token"]


@pytest.fixture(scope="session")
def headers(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="session")
def mongo():
    client = MongoClient(MONGO_URL)
    yield client[DB_NAME]
    client.close()


# ---------- auth guard ----------
def test_history_requires_auth():
    r = requests.get(f"{BASE_URL}/api/scan/history", timeout=30)
    assert r.status_code == 401


def test_delete_requires_auth():
    r = requests.delete(f"{BASE_URL}/api/scan/history/scan_xxxx", timeout=30)
    assert r.status_code == 401


# ---------- scan persists and returns scan_id ----------
def test_scan_persists_and_returns_scan_id(headers, mongo):
    payload = {"image_base64": LEAF_DATA_URI, "mime_type": "image/jpeg", "language": "en"}
    r = requests.post(f"{BASE_URL}/api/ai/scan", headers=headers, json=payload, timeout=120)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "scan_id" in data and data["scan_id"].startswith("scan_")
    assert data["diagnosis"] and data["confidence"]
    assert isinstance(data["symptoms"], list) and isinstance(data["remedies"], list)
    # DB row exists with all required fields
    doc = mongo.scan_history.find_one({"scan_id": data["scan_id"]})
    assert doc is not None
    for key in ["user_id", "scan_id", "diagnosis", "confidence", "symptoms",
                "remedies", "image_base64", "language", "created_at"]:
        assert key in doc, f"missing {key} in stored scan"
    assert doc["deleted_at"] is None
    pytest.SEEDED_SCAN_ID = data["scan_id"]  # type: ignore[attr-defined]


# ---------- history list ----------
def test_history_list_returns_new_scan_first(headers):
    r = requests.get(f"{BASE_URL}/api/scan/history", headers=headers, timeout=30)
    assert r.status_code == 200
    items = r.json()
    assert isinstance(items, list) and len(items) >= 1
    top = items[0]
    assert top["scan_id"] == pytest.SEEDED_SCAN_ID  # newest first
    # Response must exclude _id and user_id
    assert "_id" not in top and "user_id" not in top
    for key in ["scan_id", "diagnosis", "confidence", "symptoms",
                "remedies", "image_base64", "language", "created_at"]:
        assert key in top
    # max 50
    assert len(items) <= 50


# ---------- soft delete ----------
def test_delete_soft_deletes(headers, mongo):
    scan_id = pytest.SEEDED_SCAN_ID
    r = requests.delete(f"{BASE_URL}/api/scan/history/{scan_id}", headers=headers, timeout=30)
    assert r.status_code == 200 and r.json().get("ok") is True

    # Not in list anymore
    listing = requests.get(f"{BASE_URL}/api/scan/history", headers=headers, timeout=30).json()
    assert all(item["scan_id"] != scan_id for item in listing)

    # Still in DB but deleted_at set
    doc = mongo.scan_history.find_one({"scan_id": scan_id})
    assert doc is not None and doc["deleted_at"] is not None


def test_delete_missing_returns_404(headers):
    r = requests.delete(
        f"{BASE_URL}/api/scan/history/scan_does_not_exist_{uuid.uuid4().hex[:6]}",
        headers=headers, timeout=30,
    )
    assert r.status_code == 404


def test_delete_already_deleted_returns_404(headers):
    r = requests.delete(
        f"{BASE_URL}/api/scan/history/{pytest.SEEDED_SCAN_ID}",
        headers=headers, timeout=30,
    )
    assert r.status_code == 404


def test_delete_other_users_scan_returns_404(headers, mongo):
    # sign up an ephemeral user, create a scan record for them, ensure our QA user can't delete it
    other_email = f"TEST_other_{uuid.uuid4().hex[:8]}@krishiai.app"
    signup = requests.post(
        f"{BASE_URL}/api/auth/signup",
        json={"email": other_email, "password": "AnotherPass1!", "name": "Other"},
        timeout=30,
    )
    assert signup.status_code == 200, signup.text
    other_token = signup.json()["session_token"]
    other_user_id = signup.json()["user"]["user_id"]

    # Insert a fake scan directly for the other user (avoids extra LLM cost)
    other_scan_id = f"scan_other_{uuid.uuid4().hex[:8]}"
    from datetime import datetime, timezone
    mongo.scan_history.insert_one({
        "scan_id": other_scan_id, "user_id": other_user_id,
        "diagnosis": "TEST", "confidence": "Low", "symptoms": ["s"], "remedies": ["r"],
        "image_base64": LEAF_DATA_URI, "language": "en",
        "created_at": datetime.now(timezone.utc), "deleted_at": None,
    })

    # QA user attempts delete -> 404
    r = requests.delete(f"{BASE_URL}/api/scan/history/{other_scan_id}", headers=headers, timeout=30)
    assert r.status_code == 404

    # Owner can still list it
    listing = requests.get(
        f"{BASE_URL}/api/scan/history",
        headers={"Authorization": f"Bearer {other_token}"}, timeout=30,
    ).json()
    assert any(item["scan_id"] == other_scan_id for item in listing)

    # Cleanup
    mongo.scan_history.delete_many({"user_id": other_user_id})
    mongo.user_sessions.delete_many({"user_id": other_user_id})
    mongo.users.delete_many({"user_id": other_user_id})


# ---------- index ----------
def test_scan_history_compound_index_exists(mongo):
    indexes = mongo.scan_history.index_information()
    matched = False
    for _, spec in indexes.items():
        keys = spec.get("key")
        if keys == [("user_id", 1), ("created_at", -1)]:
            matched = True
            break
    assert matched, f"expected compound index (user_id:1, created_at:-1); got {indexes}"
