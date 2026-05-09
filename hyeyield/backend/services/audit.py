import logging
import json
from datetime import datetime
from typing import Any, Dict, Optional
from sqlalchemy.ext.asyncio import AsyncSession

audit_logger = logging.getLogger("audit")


class AuditLog:
    """Structured security audit logging"""

    @staticmethod
    async def log(
        event_type: str,
        user_id: Optional[int] = None,
        ip: Optional[str] = None,
        details: Optional[Dict[str, Any]] = None,
        db: Optional[AsyncSession] = None,
    ):
        """Log security event in structured format"""
        log_entry = {
            "timestamp": datetime.utcnow().isoformat(),
            "event_type": event_type,
            "user_id": user_id,
            "ip": ip,
            "details": details or {},
        }
        audit_logger.info(json.dumps(log_entry))

    @staticmethod
    async def auth_failure(username: str, ip: str, reason: str, db: Optional[AsyncSession] = None):
        """Log failed authentication attempt"""
        await AuditLog.log("AUTH_FAILURE", ip=ip, details={"username": username, "reason": reason}, db=db)

    @staticmethod
    async def auth_success(user_id: int, ip: str, db: Optional[AsyncSession] = None):
        """Log successful authentication"""
        await AuditLog.log("AUTH_SUCCESS", user_id=user_id, ip=ip, db=db)

    @staticmethod
    async def authorization_failure(
        user_id: int, action: str, resource: str, ip: str, db: Optional[AsyncSession] = None
    ):
        """Log authorization failure (attempted unauthorized access)"""
        await AuditLog.log(
            "AUTHZ_FAILURE",
            user_id=user_id,
            ip=ip,
            details={"action": action, "resource": resource},
            db=db,
        )

    @staticmethod
    async def sensitive_operation(user_id: int, action: str, details: Dict[str, Any], ip: str, db: Optional[AsyncSession] = None):
        """Log sensitive operations (delete, invest, credential changes)"""
        full_details = {"action": action, **details}
        await AuditLog.log("SENSITIVE_OPERATION", user_id=user_id, ip=ip, details=full_details, db=db)

    @staticmethod
    async def rate_limit_exceeded(ip: str, endpoint: str, db: Optional[AsyncSession] = None):
        """Log rate limit violations"""
        await AuditLog.log("RATE_LIMIT", ip=ip, details={"endpoint": endpoint}, db=db)

    @staticmethod
    async def token_refresh(user_id: int, ip: str, db: Optional[AsyncSession] = None):
        """Log token refresh events"""
        await AuditLog.log("TOKEN_REFRESH", user_id=user_id, ip=ip, db=db)

    @staticmethod
    async def invalid_csrf(user_id: Optional[int], ip: str, endpoint: str, db: Optional[AsyncSession] = None):
        """Log CSRF token validation failures"""
        await AuditLog.log(
            "CSRF_FAILURE", user_id=user_id, ip=ip, details={"endpoint": endpoint}, db=db
        )
