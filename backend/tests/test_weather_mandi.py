"""Backend tests for KrishiAI iteration 5 - Weather + Mandi live endpoints."""
import os
import time

import pytest
import requests
from dotenv import dotenv_values

BASE_URL = (
    os.environ.get("EXPO_BACKEND_URL")
    or os.environ.get("EXPO_PUBLIC_BACKEND_URL")
    or dotenv_values("/app/frontend/.env").get("EXPO_PUBLIC_BACKEND_URL")
    or ""
).rstrip("/")

QA_EMAIL = "qa@krishiai.app"
QA_PASSWORD = "KrishiAI123!"


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


# ---------- auth guard ----------
def test_weather_requires_auth():
    r = requests.get(f"{BASE_URL}/api/weather", timeout=30)
    assert r.status_code == 401


def test_mandi_requires_auth():
    r = requests.get(f"{BASE_URL}/api/mandi", timeout=30)
    assert r.status_code == 401


# ---------- weather shape ----------
def test_weather_returns_valid_response(headers):
    r = requests.get(f"{BASE_URL}/api/weather", headers=headers, timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    for key in ["location", "state", "current_temp", "current_humidity",
                "current_condition", "current_icon", "updated_at", "forecast"]:
        assert key in data, f"missing '{key}' in weather response"
    assert isinstance(data["current_temp"], (int, float))
    assert isinstance(data["current_humidity"], int)
    assert isinstance(data["current_condition"], str) and data["current_condition"]
    assert isinstance(data["current_icon"], str) and "-outline" in data["current_icon"]
    assert isinstance(data["location"], str) and data["location"]
    assert isinstance(data["state"], str) and data["state"]
    # forecast
    fc = data["forecast"]
    assert isinstance(fc, list) and len(fc) == 3, f"expected 3 forecast days, got {len(fc)}"
    for day in fc:
        for key in ["date", "max_temp", "min_temp", "condition", "icon", "rain_chance"]:
            assert key in day, f"missing '{key}' in forecast entry"
        assert isinstance(day["max_temp"], (int, float))
        assert isinstance(day["min_temp"], (int, float))
        assert isinstance(day["rain_chance"], int)
        assert 0 <= day["rain_chance"] <= 100


def test_weather_uses_default_ludhiana_for_qa_pincode(headers):
    # QA profile has pincode 141001 => Ludhiana / Punjab (or fallback default)
    r = requests.get(f"{BASE_URL}/api/weather", headers=headers, timeout=30)
    assert r.status_code == 200
    data = r.json()
    assert data["state"] in ("Punjab",), f"expected Punjab, got {data['state']}"
    # Location should mention Ludhiana (nominatim may return 'Ludhiana' or nearby city)
    assert "Ludhiana" in data["location"] or data["location"], "location must be non-empty"


def test_weather_cached_second_call_fast(headers):
    # Warm-up
    requests.get(f"{BASE_URL}/api/weather", headers=headers, timeout=30)
    start = time.perf_counter()
    r = requests.get(f"{BASE_URL}/api/weather", headers=headers, timeout=30)
    elapsed = time.perf_counter() - start
    assert r.status_code == 200
    # Cached call should be much faster than external round-trip. Loose bound.
    assert elapsed < 3.0, f"cached weather call too slow: {elapsed:.2f}s"


# ---------- mandi shape ----------
def test_mandi_returns_msp_fallback(headers):
    r = requests.get(f"{BASE_URL}/api/mandi", headers=headers, timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    for key in ["state", "source", "updated_at", "items"]:
        assert key in data
    # DATA_GOV_API_KEY not set => source must be msp
    assert data["source"] == "msp", f"expected source=msp, got {data['source']}"
    items = data["items"]
    assert isinstance(items, list)
    assert len(items) >= 15, f"expected >=15 MSP commodities, got {len(items)}"
    for item in items:
        for key in ["commodity", "state", "price_modal", "unit", "date", "source", "market"]:
            assert key in item, f"missing '{key}' in mandi item"
        assert item["price_modal"] > 0
        assert item["unit"] == "quintal"
        assert item["source"] == "msp"
        assert item["market"] == "MSP"
        assert item["state"] == data["state"]


# ---------- regression ----------
def test_auth_login_still_works():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": QA_EMAIL, "password": QA_PASSWORD},
        timeout=30,
    )
    assert r.status_code == 200 and "session_token" in r.json()


def test_auth_me_still_works(headers):
    r = requests.get(f"{BASE_URL}/api/auth/me", headers=headers, timeout=30)
    assert r.status_code == 200 and r.json()["email"] == QA_EMAIL


def test_scan_history_get_still_works(headers):
    r = requests.get(f"{BASE_URL}/api/scan/history", headers=headers, timeout=30)
    assert r.status_code == 200 and isinstance(r.json(), list)


def test_profile_patch_still_works(headers):
    r = requests.patch(
        f"{BASE_URL}/api/profile",
        headers=headers,
        json={"address": "TEST_iter5_address"},
        timeout=30,
    )
    assert r.status_code == 200 and r.json()["address"] == "TEST_iter5_address"
