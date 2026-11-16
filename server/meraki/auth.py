"""Pluggable authentication boundary; no external identity provider is assumed."""
import hashlib
from datetime import datetime, timezone
from typing import Protocol
from fastapi import HTTPException
from sqlalchemy.orm import Session
from .models import SessionToken


class IdentityProvider(Protocol):
    def authenticate(self, bearer_token: str, db: Session) -> str:
        """Return a verified internal user ID or raise an authentication error."""


class DevelopmentSessionIdentityProvider:
    """Synthetic DB sessions. Never use in production."""
    def authenticate(self, bearer_token: str, db: Session) -> str:
        token_hash = hashlib.sha256(bearer_token.encode()).hexdigest()
        session_row = db.get(SessionToken, token_hash)
        expires = session_row.expires_at if session_row else None
        if expires and expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)
        if not session_row or expires <= datetime.now(timezone.utc):
            raise HTTPException(401, "Invalid or expired session")
        return session_row.user_id
