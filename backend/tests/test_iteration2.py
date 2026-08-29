import os
import requests
from dotenv import dotenv_values

BASE_URL = (os.environ.get("EXPO_BACKEND_URL") or os.environ.get("EXPO_PUBLIC_BACKEND_URL") or dotenv_values("/app/frontend/.env").get("EXPO_PUBLIC_BACKEND_URL") or "").rstrip("/")


def test_auth_profile_preferences_logout_contract():
    s = requests.Session()
    login = s.post(f"{BASE_URL}/api/auth/login", json={"email": "qa@krishiai.app", "password": "KrishiAI123!"}, timeout=30)
    assert login.status_code == 200
    data = login.json()
    assert data["session_token"] and "_id" not in data["user"]
    token = data["session_token"]
    headers = {"Authorization": f"Bearer {token}"}
    me = s.get(f"{BASE_URL}/api/auth/me", headers=headers, timeout=30)
    assert me.status_code == 200 and me.json()["email"] == "qa@krishiai.app"
    profile = s.patch(f"{BASE_URL}/api/profile", headers=headers, json={"address": "TEST_regression_address"}, timeout=30)
    assert profile.status_code == 200 and profile.json()["address"] == "TEST_regression_address"
    prefs = s.patch(f"{BASE_URL}/api/preferences", headers=headers, json={"language": "hi", "theme": "light"}, timeout=30)
    assert prefs.status_code == 200 and prefs.json()["language"] == "hi" and prefs.json()["theme"] == "light"
    logout = s.post(f"{BASE_URL}/api/auth/logout", headers=headers, timeout=30)
    assert logout.status_code == 200
    assert s.get(f"{BASE_URL}/api/auth/me", headers=headers, timeout=30).status_code == 401


def test_unauthenticated_ai_is_rejected():
    response = requests.post(f"{BASE_URL}/api/ai/chat", json={"message": "hello", "language": "en"}, timeout=30)
    assert response.status_code == 401