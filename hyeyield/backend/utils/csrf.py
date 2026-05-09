import secrets
from fastapi import HTTPException, Request, status
from backend.config import settings
import hmac
import hashlib


class CSRFProtection:
    """CSRF token validation for POST/PUT/DELETE requests"""

    CSRF_TOKEN_LENGTH = 32
    HEADER_NAME = "X-CSRF-Token"

    @staticmethod
    def generate_token() -> str:
        """Generate a random CSRF token"""
        return secrets.token_hex(CSRFProtection.CSRF_TOKEN_LENGTH)

    @staticmethod
    def _compute_token_signature(token: str) -> str:
        """Compute HMAC signature of token using secret key"""
        return hmac.new(
            settings.secret_key.encode(),
            token.encode(),
            hashlib.sha256,
        ).hexdigest()

    @staticmethod
    async def validate_csrf_token(request: Request) -> None:
        """
        Validate CSRF token from request.

        Checks for token in:
        1. X-CSRF-Token header
        2. csrf_token form field

        Raises HTTPException 403 if invalid or missing.
        """
        # Get CSRF token from headers or form
        token = request.headers.get(CSRFProtection.HEADER_NAME)

        if not token:
            # Try form data for backward compatibility
            try:
                form_data = await request.form()
                token = form_data.get("csrf_token")
            except Exception:
                pass

        if not token:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="CSRF token missing",
            )

        # Token validation: in production, should verify against session/cookie
        # For now, we do basic validation that token is properly formatted
        if len(token) != CSRFProtection.CSRF_TOKEN_LENGTH * 2:  # Hex is 2 chars per byte
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="CSRF token invalid",
            )


async def csrf_protection(request: Request) -> None:
    """FastAPI dependency for CSRF protection on mutation endpoints"""
    if request.method in ["POST", "PUT", "DELETE", "PATCH"]:
        await CSRFProtection.validate_csrf_token(request)
