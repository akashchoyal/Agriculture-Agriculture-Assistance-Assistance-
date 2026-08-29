"""Iteration 7 backend API tests: live location persistence + weather/mandi GPS usage."""

import os
from typing import Dict

import pytest
import requests
from dotenv import dotenv_values


# Module: public API base URL + QA credentials
BASE_URL = (
    os.environ.get("EXPO_BACKEND_URL")
    or os.environ.get("EXPO_PUBLIC_BACKEND_URL")
    or dotenv_values("/app/frontend/.env").get("EXPO_BACKEND_URL")
    or dotenv_values("/app/frontend/.env").get("EXPO_PUBLIC_BACKEND_URL")
    or ""
).rstrip("/")
QA_EMAIL = "qa@krishiai.app"
QA_PASSWORD = "KrishiAI123!"


@pytest.fixture(scope="session")
def api_client() -> requests.Session:
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture(scope="session")
def auth_context(api_client: requests.Session) -> Dict[str, str]:
    login = api_client.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": QA_EMAIL, "password": QA_PASSWORD},
        timeout=30,
    )
    assert login.status_code == 200, login.text
    token = login.json()["session_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture()
def restore_profile_location(api_client: requests.Session, auth_context: Dict[str, str]):
    # Module: capture existing profile location and restore after mutation tests
    me = api_client.get(f"{BASE_URL}/api/auth/me", headers=auth_context, timeout=30)
    assert me.status_code == 200, me.text
    original = me.json()
    yield original
    if original.get("latitude") is not None and original.get("longitude") is not None:
        api_client.patch(
            f"{BASE_URL}/api/profile/location",
            headers=auth_context,
            json={"latitude": original["latitude"], "longitude": original["longitude"]},
            timeout=30,
        )


# Module: /api/profile/location auth + validation + persistence
def test_profile_location_requires_auth(api_client: requests.Session):
    response = api_client.patch(
        f"{BASE_URL}/api/profile/location",
        json={"latitude": 30.900965, "longitude": 75.857276},
        timeout=30,
    )
    assert response.status_code == 401


def test_profile_location_rejects_out_of_range_coordinates(api_client: requests.Session, auth_context: Dict[str, str]):
    response = api_client.patch(
        f"{BASE_URL}/api/profile/location",
        headers=auth_context,
        json={"latitude": 120.0, "longitude": 75.857276},
        timeout=30,
    )
    assert response.status_code == 422


def test_profile_location_reverse_geocodes_and_persists(
    api_client: requests.Session,
    auth_context: Dict[str, str],
    restore_profile_location,
):
    response = api_client.patch(
        f"{BASE_URL}/api/profile/location",
        headers=auth_context,
        json={"latitude": 30.900965, "longitude": 75.857276},
        timeout=30,
    )
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["latitude"] == pytest.approx(30.900965, rel=0, abs=1e-6)
    assert data["longitude"] == pytest.approx(75.857276, rel=0, abs=1e-6)
    assert isinstance(data.get("location_city"), str) and data.get("location_city", "").strip()
    assert isinstance(data.get("location_state"), str) and data.get("location_state", "").strip()
    assert isinstance(data.get("address"), str) and data.get("address", "").strip()
    assert isinstance(data.get("pincode"), str) and data.get("pincode", "").strip()

    verify = api_client.get(f"{BASE_URL}/api/auth/me", headers=auth_context, timeout=30)
    assert verify.status_code == 200, verify.text
    me = verify.json()
    assert me["latitude"] == pytest.approx(30.900965, rel=0, abs=1e-6)
    assert me["longitude"] == pytest.approx(75.857276, rel=0, abs=1e-6)
    assert me.get("location_city") == data.get("location_city")
    assert me.get("location_state") == data.get("location_state")


# Module: /api/weather response + GPS-context behavior
def test_weather_uses_saved_gps_and_returns_three_day_forecast(
    api_client: requests.Session,
    auth_context: Dict[str, str],
    restore_profile_location,
):
    save = api_client.patch(
        f"{BASE_URL}/api/profile/location",
        headers=auth_context,
        json={"latitude": 30.900965, "longitude": 75.857276},
        timeout=30,
    )
    assert save.status_code == 200, save.text
    profile_city = save.json().get("location_city", "")
    profile_state = save.json().get("location_state", "")

    weather = api_client.get(f"{BASE_URL}/api/weather", headers=auth_context, timeout=30)
    assert weather.status_code == 200, weather.text
    data = weather.json()
    assert isinstance(data.get("location"), str) and data["location"].strip()
    assert isinstance(data.get("state"), str) and data["state"].strip()
    assert isinstance(data.get("forecast"), list) and len(data["forecast"]) == 3
    for day in data["forecast"]:
        assert isinstance(day.get("date"), str) and day["date"]
        assert isinstance(day.get("max_temp"), (int, float))
        assert isinstance(day.get("min_temp"), (int, float))
        assert isinstance(day.get("rain_chance"), int)

    if profile_city:
        assert profile_city.lower() in data["location"].lower()
    if profile_state:
        assert profile_state.lower() in data["state"].lower()


# Module: /api/mandi state derivation + item payload regression checks
def test_mandi_uses_gps_state_and_items_shape_stays_valid(
    api_client: requests.Session,
    auth_context: Dict[str, str],
    restore_profile_location,
):
    save = api_client.patch(
        f"{BASE_URL}/api/profile/location",
        headers=auth_context,
        json={"latitude": 30.900965, "longitude": 75.857276},
        timeout=30,
    )
    assert save.status_code == 200, save.text
    expected_state = save.json().get("location_state", "")

    mandi = api_client.get(f"{BASE_URL}/api/mandi", headers=auth_context, timeout=30)
    assert mandi.status_code == 200, mandi.text
    data = mandi.json()
    assert data.get("source") in ("live", "msp")
    assert isinstance(data.get("items"), list) and len(data["items"]) > 0
    assert isinstance(data.get("state"), str) and data["state"].strip()
    if expected_state:
        assert expected_state.lower() in data["state"].lower()

    first = data["items"][0]
    assert isinstance(first.get("commodity"), str) and first["commodity"]
    assert isinstance(first.get("state"), str) and first["state"]
    assert isinstance(first.get("price_modal"), (int, float))
    assert isinstance(first.get("date"), str) and first["date"]
    assert first.get("source") in ("live", "msp")


# Module: minimal auth/login regression
def test_login_and_me_regression(api_client: requests.Session, auth_context: Dict[str, str]):
    me = api_client.get(f"{BASE_URL}/api/auth/me", headers=auth_context, timeout=30)
    assert me.status_code == 200, me.text
    assert me.json().get("email") == QA_EMAIL
