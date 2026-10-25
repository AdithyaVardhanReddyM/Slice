"""WooCommerce REST keys at rest: Fernet-encrypted with CATALOG_SECRET_KEY.

Convex stores only the ciphertext and the console never receives it, so a
leaked database row is useless without the agent's key. Rotating the key
means merchants reconnect WooCommerce.
"""

from __future__ import annotations

import base64
import hashlib
import json
import os

from cryptography.fernet import Fernet, InvalidToken


class SecretError(Exception):
    pass


def _fernet() -> Fernet:
    raw = os.environ.get("CATALOG_SECRET_KEY", "").strip()
    if not raw:
        raise SecretError("Set CATALOG_SECRET_KEY in apps/agent/.env to store WooCommerce keys.")
    # Any passphrase works; it's stretched to the 32 bytes Fernet wants.
    return Fernet(base64.urlsafe_b64encode(hashlib.sha256(raw.encode()).digest()))


def seal(consumer_key: str, consumer_secret: str) -> str:
    return _fernet().encrypt(json.dumps({"ck": consumer_key, "cs": consumer_secret}).encode()).decode()


def unseal(token: str) -> tuple[str, str]:
    try:
        data = json.loads(_fernet().decrypt(token.encode()))
    except InvalidToken as err:
        raise SecretError("The stored WooCommerce keys can't be read (CATALOG_SECRET_KEY changed). Reconnect WooCommerce.") from err
    return data["ck"], data["cs"]
