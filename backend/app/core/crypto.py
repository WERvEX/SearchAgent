import os

from cryptography.fernet import Fernet

from app.core.paths import get_key_path


def _load_or_create_key() -> bytes:
    path = get_key_path()
    if path.exists():
        return path.read_bytes()

    key = Fernet.generate_key()
    path.write_bytes(key)
    try:
        os.chmod(path, 0o600)
    except OSError:
        # chmod may be unsupported on some Windows setups; ignore.
        pass
    return key


def get_fernet() -> Fernet:
    return Fernet(_load_or_create_key())


def encrypt(plaintext: str) -> str:
    return get_fernet().encrypt(plaintext.encode()).decode()


def decrypt(token: str) -> str:
    return get_fernet().decrypt(token.encode()).decode()


def mask_secret(value: str, visible: int = 4) -> str:
    """Return a display-safe masked form: keep a short prefix, hide the rest."""
    if not value:
        return ""
    if len(value) <= visible:
        return "****"
    return value[:visible] + "****"
