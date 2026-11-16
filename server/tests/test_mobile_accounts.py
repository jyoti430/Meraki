"""No messages are sent; every phone below is a synthetic test identifier."""
import hashlib
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from server.meraki.app import create_app
from server.meraki.models import PasswordCredential, SessionToken
from server.meraki.services import utcnow


@pytest.fixture
def system(tmp_path, monkeypatch):
    monkeypatch.setenv("MERAKI_PASSWORD_AUTH", "1")
    monkeypatch.setenv("MERAKI_ALLOW_REGISTRATION", "1")
    monkeypatch.setenv("MERAKI_DEV_AUTH", "0")
    monkeypatch.setenv("MERAKI_ENV", "development")
    app = create_app(f"sqlite:///{tmp_path / 'mobile.sqlite3'}", create_schema=True)
    with TestClient(app) as client:
        yield client, app
    app.state.engine.dispose()


def registration(role="fpo", **changes):
    return {"mobile_number": "+1 (202) 555-0100", "password": "Synthetic-Test-Password!",
            "display_name": "Demo user", "organisation_name": "Demo organisation", "role": role, **changes}


def headers(account):
    return {"Authorization": "Bearer " + account["access_token"], "X-Organisation-ID": account["organisation_id"]}


@pytest.mark.parametrize("role", ["fpo", "exporter"])
def test_mobile_registration_login_restore_and_revoke(system, role):
    client, app = system
    assert client.get("/api/v1/health").json()["mobile_auth_enabled"] is True
    response = client.post("/api/v1/auth/register", json=registration(role))
    assert response.status_code == 201, response.text
    account = response.json()
    assert account["role"] == role
    assert "mobile_number" not in account
    with app.state.sessions() as db:
        credential = db.scalar(select(PasswordCredential))
        assert credential.mobile_number == "+12025550100"
        assert credential.password_hash != "Synthetic-Test-Password!"
        assert db.get(SessionToken, hashlib.sha256(account["access_token"].encode()).hexdigest())
    login = client.post("/api/v1/auth/login", json={"mobile_number": "+12025550100", "password": "Synthetic-Test-Password!"})
    assert login.status_code == 200
    account = login.json()
    me = client.get("/api/v1/auth/me", headers=headers(account))
    assert me.status_code == 200
    assert me.json()["organisation_id"] == account["organisation_id"]
    assert me.json()["role"] == role
    assert client.post("/api/v1/auth/logout", json={}, headers=headers(account)).status_code == 204
    assert client.get("/api/v1/auth/me", headers=headers(account)).status_code == 401


def test_normalized_duplicate_number_wrong_password_and_org_scope(system):
    client, _ = system
    account = client.post("/api/v1/auth/register", json=registration()).json()
    assert client.post("/api/v1/auth/register", json=registration(mobile_number="+12025550100")).status_code == 409
    for number in ["+12025550100", "+12025550199"]:
        bad = client.post("/api/v1/auth/login", json={"mobile_number": number, "password": "Wrong-test-password!"})
        assert bad.status_code == 401
        assert bad.json()["error"]["message"] == "Invalid mobile number or password"
    assert client.get("/api/v1/auth/me", headers={**headers(account), "X-Organisation-ID": "another-org"}).status_code == 403


@pytest.mark.parametrize("number", ["9876543210", "+0123456789", "+1hello5550100", "+12345", "+1234567890123456"])
def test_invalid_phone_rejected_without_creating_account(system, number):
    client, app = system
    assert client.post("/api/v1/auth/register", json=registration(mobile_number=number)).status_code == 422
    with app.state.sessions() as db:
        assert db.scalar(select(PasswordCredential)) is None


def test_legacy_username_password_whitespace_and_expiry_are_preserved(system):
    client, app = system
    body = registration(username="Legacy.User", password="  Synthetic-Test-Password!  ")
    del body["mobile_number"]
    assert client.post("/api/v1/auth/register", json=body).status_code == 201
    login = {"username": "LEGACY.USER", "password": body["password"]}
    response = client.post("/api/v1/auth/login", json=login)
    assert response.status_code == 200
    assert client.post("/api/v1/auth/login", json={**login, "password": body["password"].strip()}).status_code == 401
    account = response.json()
    with app.state.sessions() as db, db.begin():
        token = db.get(SessionToken, hashlib.sha256(account["access_token"].encode()).hexdigest())
        token.expires_at = utcnow() - timedelta(seconds=1)
    assert client.get("/api/v1/auth/me", headers=headers(account)).status_code == 401
    assert client.post("/api/v1/auth/login", json={**login, "mobile_number": "+12025550100"}).status_code == 422


def test_formatted_mobile_cannot_bypass_rate_limit(system):
    client, _ = system
    for _ in range(10):
        assert client.post("/api/v1/auth/login", json={"mobile_number": "+1 202-555-0100", "password": "Wrong-test-password!"}).status_code == 401
    assert client.post("/api/v1/auth/login", json={"mobile_number": "+12025550100", "password": "Wrong-test-password!"}).status_code == 429


def test_registration_and_password_gates_stay_operator_controlled(system, monkeypatch):
    client, _ = system
    monkeypatch.setenv("MERAKI_ALLOW_REGISTRATION", "0")
    assert client.get("/api/v1/health").json()["registration_enabled"] is False
    assert client.post("/api/v1/auth/register", json=registration()).status_code == 403



def test_shared_gateway_allows_distinct_accounts_without_weakening_identity_limit(system):
    client, _ = system
    for phone, role in [("+12025550100", "fpo"), ("+12025550101", "exporter")]:
        assert client.post("/api/v1/auth/register", json=registration(role, mobile_number=phone)).status_code == 201
    # Twelve logins through one TestClient peer used to block both organisations.
    for index in range(12):
        phone = "+12025550100" if index % 2 == 0 else "+12025550101"
        result = client.post("/api/v1/auth/login", json={"mobile_number": phone, "password": "Synthetic-Test-Password!"})
        assert result.status_code == 200, result.text
    # The FPO identity still reaches the original ten-attempt cap independently.
    for _ in range(4):
        assert client.post("/api/v1/auth/login", json={"mobile_number": "+12025550100", "password": "Wrong-test-password!"}).status_code == 401
    assert client.post("/api/v1/auth/login", json={"mobile_number": "+12025550100", "password": "Wrong-test-password!"}).status_code == 429
    assert client.post("/api/v1/auth/login", json={"mobile_number": "+12025550101", "password": "Synthetic-Test-Password!"}).status_code == 200


def test_shared_gateway_still_bounds_distributed_login_attempts(system):
    client, _ = system
    for index in range(100):
        response = client.post("/api/v1/auth/login", json={"mobile_number": f"+1202555{index:04d}", "password": "Wrong-test-password!"})
        assert response.status_code == 401
    assert client.post("/api/v1/auth/login", json={"mobile_number": "+12025550999", "password": "Wrong-test-password!"}).status_code == 429


def test_shared_gateway_signup_has_a_separate_twenty_attempt_bound(system):
    client, _ = system
    for index in range(20):
        assert client.post("/api/v1/auth/register", json=registration(mobile_number=f"+1202555{index:04d}")).status_code == 201
    assert client.post("/api/v1/auth/register", json=registration(mobile_number="+12025550999")).status_code == 429
