from cryptography.fernet import Fernet, InvalidToken
from backend.config import settings


def _fernet() -> Fernet:
    return Fernet(settings.encrypt_key.encode())


def encrypt(plaintext: str) -> str:
    return _fernet().encrypt(plaintext.encode()).decode()


def decrypt(ciphertext: str) -> str:
    try:
        return _fernet().decrypt(ciphertext.encode()).decode()
    except (InvalidToken, Exception) as exc:
        raise ValueError("Decryption failed") from exc
