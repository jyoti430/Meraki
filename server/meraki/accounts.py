"""No-email credentials with expiring, revocable, hashed database sessions."""
import hashlib
import hmac
import os
import secrets
from datetime import timedelta
from uuid import uuid4
from fastapi import Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from .auction_schemas import Register, Login
from .auth import DevelopmentSessionIdentityProvider
from .models import AuthThrottle, Membership, Organization, PasswordCredential, SessionToken, User
from .services import aware, utcnow


class PasswordSessionIdentityProvider(DevelopmentSessionIdentityProvider):
    def authenticate(self, bearer_token, db):
        user_id = super().authenticate(bearer_token, db)
        user = db.get(User, user_id)
        if not user or user.identity_provider != "local-password":
            raise HTTPException(401, "Password session required")
        return user_id


def password_hash(password, salt=None):
    salt = salt or secrets.token_hex(16)
    digest = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=32768, r=8, p=1, maxmem=64 * 1024 * 1024).hex()
    return f"scrypt-v1${salt}${digest}"


def issue_session(db, user_id):
    token = secrets.token_urlsafe(40)
    db.add(SessionToken(token_hash=hashlib.sha256(token.encode()).hexdigest(), user_id=user_id, expires_at=utcnow() + timedelta(hours=8)))
    membership = db.scalar(select(Membership).where(Membership.user_id == user_id, Membership.status == "active"))
    return {"access_token": token, "organisation_id": membership.organisation_id, "role": membership.role,
            "expires_in": 28800, "token_type": "bearer"}


def install_accounts(app, db_session, actor, environment):
    enabled = os.getenv("MERAKI_PASSWORD_AUTH") == "1"

    def account_guard():
        if not enabled: raise HTTPException(404, "Password accounts are disabled")

    def throttle(db, key):
        # PostgreSQL advisory transaction lock also serialises the first attempt.
        from sqlalchemy import text
        hashed = hashlib.sha256(key.encode()).hexdigest()
        if db.bind.dialect.name == "postgresql":
            db.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": int(hashed[:15], 16)})
        row = db.scalar(select(AuthThrottle).where(AuthThrottle.key == hashed).with_for_update())
        if row and aware(row.resets_at) > utcnow() and row.attempts >= 10:
            raise HTTPException(429, "Too many attempts. Try again in 15 minutes.")
        if not row:
            row = AuthThrottle(key=hashed, attempts=0, resets_at=utcnow() + timedelta(minutes=15)); db.add(row)
        if aware(row.resets_at) <= utcnow():
            row.attempts, row.resets_at = 0, utcnow() + timedelta(minutes=15)
        row.attempts += 1

    @app.post("/api/v1/auth/register", dependencies=[Depends(account_guard)], status_code=201)
    def register(body: Register, request: Request, db=Depends(db_session)):
        if os.getenv("MERAKI_ALLOW_REGISTRATION", "1" if environment == "development" else "0") != "1":
            raise HTTPException(403, "Registration is disabled; ask your operator for an account")
        with db.begin(): throttle(db, "register:" + (request.client.host if request.client else "unknown"))
        hashed = password_hash(body.password)
        try:
            with db.begin():
                uid, oid = uuid4().hex, uuid4().hex
                db.add(Organization(id=oid, name=body.organisation_name))
                db.add(User(id=uid, email=f"{uid}@accounts.invalid", display_name=body.display_name, identity_provider="local-password"))
                db.flush()
                permissions = ["auction:read", "auction:write", "listing:read", "reservation:read"]
                if body.role == "fpo": permissions += ["projection:read", "projection:write", "capacity:write", "capacity:read", "capacity:review", "listing:write", "document:read", "document:write"]
                db.add(Membership(user_id=uid, organisation_id=oid, role=body.role, permissions=permissions))
                db.add(PasswordCredential(username=body.username, user_id=uid, password_hash=hashed)); db.flush()
                return issue_session(db, uid)
        except IntegrityError:
            db.rollback(); raise HTTPException(409, "Username is unavailable")

    @app.post("/api/v1/auth/login", dependencies=[Depends(account_guard)])
    def login(body: Login, request: Request, db=Depends(db_session)):
        with db.begin():
            throttle(db, "login-user:" + body.username)
            throttle(db, "login-ip:" + (request.client.host if request.client else "unknown"))
        credential = db.get(PasswordCredential, body.username)
        stored = credential.password_hash if credential else password_hash("not-a-real-password", "0" * 32)
        candidate = password_hash(body.password, stored.split("$")[1])
        if not credential or not hmac.compare_digest(candidate, stored):
            raise HTTPException(401, "Invalid username or password")
        user = db.get(User, credential.user_id)
        membership = db.scalar(select(Membership).where(Membership.user_id == credential.user_id, Membership.status == "active"))
        org = db.get(Organization, membership.organisation_id) if membership else None
        if not user or user.status != "active" or not org or org.status != "active":
            raise HTTPException(403, "Account or organisation is inactive")
        result = issue_session(db, credential.user_id); db.commit()
        return result

    @app.get("/api/v1/auth/me")
    def me(user=Depends(actor)):
        return {k: user[k] for k in ("user_id", "organisation_id", "role")}

    @app.post("/api/v1/auth/logout", status_code=204)
    def logout(request: Request, user=Depends(actor), db=Depends(db_session)):
        token = request.headers.get("Authorization", "")[7:]
        row = db.get(SessionToken, hashlib.sha256(token.encode()).hexdigest())
        if row: db.delete(row)
        db.commit()
