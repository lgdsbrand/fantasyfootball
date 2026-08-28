"""Supabase Auth verification.

The browser signs in with Supabase directly and sends the resulting JWT as a
bearer token. We verify the signature here.

Supabase signs with one of two systems:

  * **Asymmetric (ES256/RS256)** — the default for projects created since 2025.
    The public key is published at the project's JWKS endpoint, so we verify
    locally against it and never need a secret. Keys are cached in memory and
    refetched when an unknown key id appears, which is how rotation works
    without redeploying.

  * **Legacy symmetric (HS256)** — older projects. Needs SUPABASE_JWT_SECRET.

The algorithm is read from the token header, so both work with no configuration
beyond SUPABASE_URL. Setting SUPABASE_JWT_SECRET is only required for the
legacy case.

Two dependencies:
  current_user  — required; 401 if the token is missing or bad
  optional_user — returns None for anonymous callers, so every tool works
                  without an account
"""
from __future__ import annotations

import asyncio
import logging
from typing import Optional

import jwt
from fastapi import HTTPException, Request, status

from .config import get_settings

log = logging.getLogger(__name__)

ASYMMETRIC_ALGS = ["ES256", "RS256", "EdDSA"]

# Clocks drift. A token issued a second or two ahead of our clock is not
# suspicious, it is normal — Supabase's servers and ours are not synchronised,
# and neither are Render's. Without leeway a perfectly valid session is
# rejected with "token is not yet valid", which looks like an auth bug and
# is really a wristwatch problem. Sixty seconds is the usual allowance.
CLOCK_LEEWAY_SECONDS = 60
_jwk_client: Optional[jwt.PyJWKClient] = None


def _jwks() -> jwt.PyJWKClient:
    """Cached JWKS client. Ten-minute lifespan matches Supabase's own edge cache,
    which keeps a rotated key from being rejected for longer than necessary."""
    global _jwk_client
    if _jwk_client is None:
        url = f"{get_settings().supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json"
        _jwk_client = jwt.PyJWKClient(url, cache_keys=True, lifespan=600)
    return _jwk_client


async def _decode(token: str) -> dict:
    settings = get_settings()
    if not settings.supabase_url:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "auth is not configured")

    try:
        alg = jwt.get_unverified_header(token).get("alg", "")
    except jwt.PyJWTError as e:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "that sign-in token is malformed") from e

    try:
        if alg == "HS256":
            if not settings.supabase_jwt_secret:
                raise HTTPException(
                    status.HTTP_500_INTERNAL_SERVER_ERROR,
                    "this project signs tokens with the legacy secret — "
                    "set SUPABASE_JWT_SECRET",
                )
            return jwt.decode(
                token, settings.supabase_jwt_secret,
                algorithms=["HS256"], audience="authenticated",
                leeway=CLOCK_LEEWAY_SECONDS,
            )

        # Asymmetric. get_signing_key_from_jwt does network I/O on a cache miss,
        # so it runs off the event loop.
        signing_key = await asyncio.to_thread(_jwks().get_signing_key_from_jwt, token)
        return jwt.decode(
            token, signing_key.key,
            algorithms=ASYMMETRIC_ALGS, audience="authenticated",
            leeway=CLOCK_LEEWAY_SECONDS,
        )
    except jwt.ExpiredSignatureError as e:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "your session expired — sign in again") from e
    except jwt.PyJWTError as e:
        log.warning("token rejected (alg=%s): %s", alg, e)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "sign in again to continue") from e


def _token(request: Request) -> Optional[str]:
    header = request.headers.get("authorization") or ""
    if header.lower().startswith("bearer "):
        return header[7:].strip() or None
    return None


def _user(claims: dict) -> dict:
    return {"id": claims.get("sub"), "email": claims.get("email")}


async def optional_user(request: Request) -> Optional[dict]:
    tok = _token(request)
    if not tok:
        return None
    try:
        return _user(await _decode(tok))
    except HTTPException:
        return None


async def current_user(request: Request) -> dict:
    tok = _token(request)
    if not tok:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "sign in to save a league")
    return _user(await _decode(tok))