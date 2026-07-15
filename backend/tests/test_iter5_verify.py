"""Iter5 fix-verification tests:
1) CRITICAL: register + immediate login within same second must both succeed with distinct tokens
2) Back-to-back logins for same user in same second return distinct tokens (jti uniqueness)
3) Refresh flow returns new distinct access+refresh tokens on back-to-back calls
4) Light OAuth regressions:
   - /auth/microsoft-verify → 400 for invalid id_token
   - /auth/apple → 400 for invalid id_token
   - /auth/google-verify → 400 for invalid credential
   - /auth/oauth-config → google/microsoft/apple enabled, facebook disabled
"""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def sess():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# ------------- CRITICAL: register + immediate login same second -------------
class TestRegisterLoginSameSecond:
    def test_register_then_login_immediately_no_500(self, sess):
        email = f"TEST_iter5_{uuid.uuid4().hex[:8]}@example.com"
        password = "Test@12345"

        r_reg = sess.post(f"{API}/auth/register", json={
            "email": email,
            "password": password,
            "full_name": "Iter5 Verify",
        }, timeout=20)
        assert r_reg.status_code == 200, f"register failed: {r_reg.status_code} {r_reg.text}"
        reg_data = r_reg.json()
        assert "access_token" in reg_data
        assert "refresh_token" in reg_data

        # Immediate login (no sleep) — previously failed with 500 duplicate refresh_token
        r_login = sess.post(f"{API}/auth/login", json={
            "email": email,
            "password": password,
        }, timeout=20)
        assert r_login.status_code == 200, f"login failed: {r_login.status_code} {r_login.text}"
        login_data = r_login.json()
        assert "access_token" in login_data
        assert "refresh_token" in login_data

        # Distinct token strings (jti claim)
        assert reg_data["access_token"] != login_data["access_token"], "access_tokens are identical"
        assert reg_data["refresh_token"] != login_data["refresh_token"], "refresh_tokens are identical"

    def test_back_to_back_logins_same_second_distinct_tokens(self, sess):
        # First register a user
        email = f"TEST_iter5_btb_{uuid.uuid4().hex[:8]}@example.com"
        password = "Test@12345"
        r_reg = sess.post(f"{API}/auth/register", json={
            "email": email,
            "password": password,
            "full_name": "BackToBack",
        }, timeout=20)
        assert r_reg.status_code == 200, r_reg.text

        # Two logins back-to-back
        r1 = sess.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=20)
        r2 = sess.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=20)
        assert r1.status_code == 200, f"login#1: {r1.status_code} {r1.text}"
        assert r2.status_code == 200, f"login#2: {r2.status_code} {r2.text}"
        d1, d2 = r1.json(), r2.json()
        assert d1["access_token"] != d2["access_token"], "back-to-back access_tokens identical"
        assert d1["refresh_token"] != d2["refresh_token"], "back-to-back refresh_tokens identical"


# ------------- Refresh flow distinct tokens -------------
class TestRefreshFlow:
    def test_refresh_returns_distinct_tokens_back_to_back(self, sess):
        email = f"TEST_iter5_ref_{uuid.uuid4().hex[:8]}@example.com"
        password = "Test@12345"
        r_reg = sess.post(f"{API}/auth/register", json={
            "email": email, "password": password, "full_name": "Ref",
        }, timeout=20)
        assert r_reg.status_code == 200, r_reg.text
        refresh = r_reg.json()["refresh_token"]

        # First refresh
        r1 = sess.post(f"{API}/auth/refresh", json={"refresh_token": refresh}, timeout=20)
        assert r1.status_code == 200, f"refresh#1: {r1.status_code} {r1.text}"
        d1 = r1.json()
        assert "access_token" in d1 and "refresh_token" in d1

        # Second refresh immediately (using the new refresh token from d1, since server may rotate)
        # Try with the new token first; if endpoint doesn't rotate, use original.
        new_ref = d1.get("refresh_token", refresh)
        r2 = sess.post(f"{API}/auth/refresh", json={"refresh_token": new_ref}, timeout=20)
        if r2.status_code != 200:
            # try with original if rotation not implemented
            r2 = sess.post(f"{API}/auth/refresh", json={"refresh_token": refresh}, timeout=20)
        assert r2.status_code == 200, f"refresh#2: {r2.status_code} {r2.text}"
        d2 = r2.json()

        assert d1["access_token"] != d2["access_token"], "refresh access_tokens identical"
        assert d1["refresh_token"] != d2["refresh_token"], "refresh refresh_tokens identical"


# ------------- OAuth regression -------------
class TestOAuthRegression:
    def test_oauth_config(self, sess):
        r = sess.get(f"{API}/auth/oauth-config", timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["google"]["enabled"] is True
        assert d["microsoft"]["enabled"] is True
        assert d["apple"]["enabled"] is True
        assert d["facebook"]["enabled"] is False

    def test_microsoft_verify_invalid_returns_400(self, sess):
        r = sess.post(f"{API}/auth/microsoft-verify", json={"id_token": "not-a-token"}, timeout=15)
        assert r.status_code == 400, f"got {r.status_code}: {r.text}"

    def test_apple_invalid_returns_400(self, sess):
        r = sess.post(f"{API}/auth/apple", json={"id_token": "not-a-token"}, timeout=15)
        assert r.status_code == 400, f"got {r.status_code}: {r.text}"

    def test_google_verify_invalid_returns_400(self, sess):
        r = sess.post(f"{API}/auth/google-verify", json={"credential": "not-a-token"}, timeout=15)
        assert r.status_code == 400, f"got {r.status_code}: {r.text}"
