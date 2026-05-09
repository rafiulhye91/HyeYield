# HyeYield Security Remediation — Implementation Guide

This guide provides step-by-step code fixes for all critical vulnerabilities.

---

## Phase 1: Emergency Fixes (Do Today)

### Fix 1.1: Rotate All Secrets

**Step 1**: Generate new secrets
```bash
cd /Users/rafiulhye/Projects/HyeYield/hyeyield

# Generate new ENCRYPT_KEY (Fernet)
python -c "from cryptography.fernet import Fernet; print('ENCRYPT_KEY=' + Fernet.generate_key().decode())"

# Generate new SECRET_KEY (32 bytes hex)
python -c "import secrets; print('SECRET_KEY=' + secrets.token_hex(32))"

# Output example:
# ENCRYPT_KEY=nxQRQJ9eoVF3Kt25FQuiftHLtMVrT3Afa0FsOAz4uG0=
# SECRET_KEY=abc123def456...
```

**Step 2**: Update `.env` with new values
```bash
cat > .env << 'EOF'
SECRET_KEY=<YOUR_NEW_SECRET_KEY>
ENCRYPT_KEY=<YOUR_NEW_ENCRYPT_KEY>
ENVIRONMENT=prod
JWT_EXPIRE_HOURS=24
JIRA_URL=https://rafiulhye.atlassian.net
JIRA_USERNAME=rafirupak@gmail.com
JIRA_API_TOKEN=<REGENERATE_AT_https://id.atlassian.com/manage-profile/security/api-tokens>
EOF
```

**Step 3**: Re-encrypt all Schwab credentials
```python
# backend/scripts/rotate_encryption_keys.py
import asyncio
from sqlalchemy import select
from backend.database import AsyncSessionLocal, engine, Base
from backend.models.user import User
from backend.config import settings

async def rotate_keys():
    """
    Re-encrypt all credentials with new ENCRYPT_KEY
    Run this ONCE after updating .env with new keys
    """
    async with AsyncSessionLocal() as session:
        users = await session.execute(select(User))
        for user in users.scalars():
            # These will use the NEW ENCRYPT_KEY from settings
            if user.app_key_enc:
                plaintext = user.get_app_key()  # Decrypts with old key
                user.set_app_key(plaintext)  # Re-encrypts with new key
            
            if user.app_secret_enc:
                plaintext = user.get_app_secret()
                user.set_app_secret(plaintext)
            
            if user.refresh_token_enc:
                plaintext = user.get_refresh_token()
                user.set_refresh_token(plaintext)
        
        await session.commit()
        print("✓ All credentials re-encrypted with new keys")

if __name__ == "__main__":
    asyncio.run(rotate_keys())
```

Run it:
```bash
cd hyeyield
source venv/bin/activate
python backend/scripts/rotate_encryption_keys.py
```

---

### Fix 1.2: Remove Secrets from Git History

**Step 1**: Install git-filter-repo
```bash
pip install git-filter-repo
```

**Step 2**: Remove .env and .db from history
```bash
cd /Users/rafiulhye/Projects/HyeYield

git filter-repo --invert-paths \
  --path hyeyield/.env \
  --path hyeyield/hyeyield.db \
  --path hyeyield/.env.example \
  --path hyeyield/frontend/.env.local \
  --path hyeyield/frontend/.env.production
```

**Step 3**: Force push to clean remote
```bash
# WARNING: Only if repo is private and no other developers
git push --force-all

# If others are using this repo, they must re-clone:
# rm -rf /path/to/HyeYield
# git clone https://github.com/YOU/HyeYield
```

**Step 4**: Verify removal
```bash
git log --all -- hyeyield/.env
# Should show: (no results)

ls hyeyield/.env
# Should still exist locally (good - git ignored, not deleted)
```

---

### Fix 1.3: Migrate JWT to HttpOnly Cookies

#### Backend Changes

**File**: `backend/config.py` - Add cookie settings
```python
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    secret_key: str
    encrypt_key: str
    environment: str = "dev"
    jwt_expire_hours: int = 24
    
    # Cookie security settings
    cookie_secure: bool = True  # HTTPS only in prod
    cookie_httponly: bool = True
    cookie_samesite: str = "strict"  # CSRF protection
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"

settings = Settings()
```

**File**: `backend/utils/jwt_utils.py` - Add refresh token support
```python
from datetime import datetime, timedelta, timezone
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy.ext.asyncio import AsyncSession

from backend.config import settings
from backend.database import get_db

_ALGORITHM = "HS256"

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


def create_access_token(user_id: int, expires_in: int = None) -> str:
    """Create a short-lived access token (default: 1 hour)"""
    if expires_in is None:
        expires_in = 3600  # 1 hour instead of 24
    
    expire = datetime.now(timezone.utc) + timedelta(seconds=expires_in)
    payload = {"sub": str(user_id), "exp": expire, "type": "access"}
    return jwt.encode(payload, settings.secret_key, algorithm=_ALGORITHM)


def create_refresh_token(user_id: int) -> str:
    """Create a long-lived refresh token (7 days)"""
    expire = datetime.now(timezone.utc) + timedelta(days=7)
    payload = {"sub": str(user_id), "exp": expire, "type": "refresh"}
    return jwt.encode(payload, settings.secret_key, algorithm=_ALGORITHM)


def decode_token(token: str, token_type: str = "access") -> int:
    """Decode and validate token"""
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[_ALGORITHM])
        
        # Verify token type
        if payload.get("type") != token_type:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token type")
        
        user_id = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
        return int(user_id)
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
):
    """Extract user from access token"""
    from sqlalchemy import select
    from backend.models.user import User

    user_id = decode_token(token, token_type="access")
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user
```

**File**: `backend/routers/auth.py` - Update auth endpoints
```python
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import JSONResponse
from backend.utils.limiter import limiter
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_db
from backend.models.user import User
from backend.schemas.auth import (
    AuthResponse, ChangePasswordRequest, LoginRequest, 
    RegisterRequest, UserProfile, UserUpdate
)
from backend.utils.auth_utils import hash_password, verify_password
from backend.utils.jwt_utils import (
    create_access_token, create_refresh_token, 
    decode_token, get_current_user
)
from backend.config import settings

router = APIRouter(prefix="/auth", tags=["auth"])


def _set_auth_cookies(response: JSONResponse, access_token: str, refresh_token: str):
    """Helper to set secure httpOnly cookies"""
    response.set_cookie(
        "access_token",
        access_token,
        httponly=True,  # Prevents JavaScript access (XSS protection)
        secure=settings.cookie_secure,  # HTTPS only in production
        samesite=settings.cookie_samesite,  # CSRF protection
        max_age=3600,  # 1 hour
        path="/",
    )
    response.set_cookie(
        "refresh_token",
        refresh_token,
        httponly=True,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
        max_age=604800,  # 7 days
        path="/",
    )


@router.post("/register", response_model=AuthResponse)
async def register(body: RegisterRequest, db: AsyncSession = Depends(get_db)):
    """Register new user"""
    result = await db.execute(select(User).where(User.username == body.username))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username already taken")

    result = await db.execute(select(User).where(User.email == body.email))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    user = User(
        username=body.username,
        email=body.email,
        password_hash=hash_password(body.password),
    )
    if body.app_key:
        user.set_app_key(body.app_key)
    if body.app_secret:
        user.set_app_secret(body.app_secret)
    
    db.add(user)
    await db.commit()
    await db.refresh(user)

    access_token = create_access_token(user.id)
    refresh_token = create_refresh_token(user.id)

    response = JSONResponse(
        content={"success": True},
        status_code=status.HTTP_201_CREATED
    )
    _set_auth_cookies(response, access_token, refresh_token)
    return response


@router.post("/login", response_model=AuthResponse)
@limiter.limit("5/minute")
async def login(request: Request, body: LoginRequest, db: AsyncSession = Depends(get_db)):
    """Login user - returns httpOnly cookies, not token in JSON"""
    result = await db.execute(select(User).where(User.username == body.username))
    user = result.scalar_one_or_none()

    # Always return 401 — never reveal whether username or password was wrong
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    access_token = create_access_token(user.id)
    refresh_token = create_refresh_token(user.id)

    response = JSONResponse(content={"success": True})
    _set_auth_cookies(response, access_token, refresh_token)
    return response


@router.post("/refresh")
async def refresh(request: Request):
    """Get new access token using refresh token cookie"""
    refresh_token = request.cookies.get("refresh_token")
    if not refresh_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No refresh token")

    try:
        user_id = decode_token(refresh_token, token_type="refresh")
    except HTTPException:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    new_access_token = create_access_token(user_id)
    response = JSONResponse(content={"success": True})
    response.set_cookie(
        "access_token",
        new_access_token,
        httponly=True,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
        max_age=3600,
        path="/",
    )
    return response


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(current_user: User = Depends(get_current_user)):
    """Logout by clearing cookies"""
    response = JSONResponse(content={"success": True}, status_code=204)
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return response


def _user_profile(user: User) -> UserProfile:
    return UserProfile(
        id=user.id,
        username=user.username,
        email=user.email,
        ntfy_topic=user.ntfy_topic,
        schedule_cron=user.schedule_cron,
        has_schwab_credentials=bool(user.app_key_enc and user.app_secret_enc),
        has_schwab_connected=bool(user.refresh_token_enc),
        created_at=user.created_at,
    )


@router.get("/me", response_model=UserProfile)
async def me(current_user: User = Depends(get_current_user)):
    """Get current user profile (uses cookie auth automatically)"""
    return _user_profile(current_user)


@router.put("/me", response_model=UserProfile)
async def update_me(
    body: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if body.ntfy_topic is not None:
        current_user.ntfy_topic = body.ntfy_topic or None
    if body.app_key:
        current_user.set_app_key(body.app_key)
    if body.app_secret:
        current_user.set_app_secret(body.app_secret)
    await db.commit()
    await db.refresh(current_user)
    return _user_profile(current_user)


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
async def change_password(
    body: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not verify_password(body.current_password, current_user.password_hash):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect")
    if len(body.new_password) < 12:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="New password must be at least 12 characters")
    current_user.password_hash = hash_password(body.new_password)
    await db.commit()


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
async def delete_account(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await db.delete(current_user)
    await db.commit()
    
    response = JSONResponse(content={"success": True}, status_code=204)
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return response


@router.post("/ntfy-test", status_code=status.HTTP_204_NO_CONTENT)
async def ntfy_test(current_user: User = Depends(get_current_user)):
    if not current_user.ntfy_topic:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="No ntfy topic configured")
    from backend.services.notify import send_notify
    await send_notify(current_user.ntfy_topic, "Hye-Yield: Test notification", "Your push notifications are working correctly.")
```

#### Frontend Changes

**File**: `frontend/src/api/client.js` - Update to use cookies
```javascript
import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000',
  withCredentials: true,  // Send cookies with every request
});

// Response interceptor for auto-refresh on 401
api.interceptors.response.use(
  response => response,
  async error => {
    if (error.response?.status === 401) {
      // Try to refresh token
      try {
        await api.post('/auth/refresh');
        // Retry original request
        return api.request(error.config);
      } catch (refreshError) {
        // Refresh failed, user must login again
        localStorage.removeItem('user');
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
```

**File**: `frontend/src/context/AuthContext.jsx` - Remove localStorage
```javascript
import { createContext, useContext, useEffect, useState } from 'react';
import api from '../api/client';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // On mount, verify user is still authenticated
    const verifyAuth = async () => {
      try {
        const res = await api.get('/auth/me');
        setUser(res.data);
      } catch {
        // Not authenticated
        setUser(null);
      } finally {
        setLoading(false);
      }
    };
    
    verifyAuth();
  }, []);

  const login = async (username, password) => {
    const res = await api.post('/auth/login', { username, password });
    // Token is now in httpOnly cookie, automatically sent by axios
    const userRes = await api.get('/auth/me');
    setUser(userRes.data);
  };

  const logout = async () => {
    await api.post('/auth/logout');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
```

**File**: `frontend/src/pages/AuthPage.jsx` - Remove localStorage references
```javascript
// In handleLogin:
const handleLogin = async (e) => {
  e.preventDefault();
  setLError('');
  setLLoading(true);
  try {
    await login(lUsername, lPassword);
    // No localStorage.setItem needed - cookie is set by server
    navigate('/dashboard');
  } catch (err) {
    setLError(err.response?.data?.detail || 'Incorrect username or password.');
  } finally {
    setLLoading(false);
  }
};
```

---

### Fix 1.4: Add CSRF Protection

**Step 1**: Install package
```bash
cd hyeyield
source venv/bin/activate
pip install fastapi-csrf-protect
```

**Step 2**: Add to `backend/main.py`
```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi_csrf_protect import CsrfProtect
from pydantic import BaseModel

app = FastAPI(title="Hye-Yield", version="1.0")

class CsrfSettings(BaseModel):
    secret_key: str

@CsrfProtect.load_config
def load_config():
    return CsrfSettings(secret_key=settings.secret_key)

# ... rest of code
```

**Step 3**: Protect mutation endpoints
```python
from fastapi_csrf_protect import CsrfProtect

@router.post("/invest/live")
async def live_invest(
    request: Request,
    csrf_protect: CsrfProtect = Depends(),
    # ... other params
):
    """CSRF protection - must include X-CSRF-Token header"""
    await csrf_protect.validate_csrf(request)  # Raises 403 if invalid
    # ... rest of endpoint
```

Protect these endpoints:
- POST /invest/live
- POST /invest/dry-run  
- POST /accounts
- PUT /accounts/{id}
- DELETE /accounts/{id}
- PUT /accounts/{id}/allocations
- POST /auth/change-password
- DELETE /auth/me

**Step 4**: Frontend sends CSRF token
```javascript
// In app.js or interceptor
import api from './api/client';

api.interceptors.request.use(config => {
  // Get CSRF token from meta tag or response header
  const token = document.querySelector('meta[name="csrf-token"]')?.content ||
                document.cookie.split('; ').find(row => row.startsWith('csrf_token='))?.split('=')[1];
  
  if (token) {
    config.headers['X-CSRF-Token'] = token;
  }
  return config;
});
```

---

## Phase 2: High-Priority Fixes

### Fix 2.1: Enforce Authorization Checks

Audit all endpoints. Example pattern:

```python
async def _get_owned_account(account_id: int, user: User, db: AsyncSession) -> SchwabAccount:
    """ALWAYS check ownership before returning account"""
    result = await db.execute(
        select(SchwabAccount).where(
            (SchwabAccount.id == account_id) &
            (SchwabAccount.user_id == user.id)  # ✓ Always check this
        )
    )
    account = result.scalar_one_or_none()
    if account is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found")
    return account

# Every endpoint that touches accounts should use this helper
@router.delete("/accounts/{account_id}")
async def delete_account(
    account_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    account = await _get_owned_account(account_id, current_user, db)  # ✓ Checks ownership
    await db.delete(account)
    await db.commit()
```

**Test it**:
```python
# backend/tests/test_authorization.py
@pytest.mark.asyncio
async def test_user_cannot_access_other_user_account():
    """User 1 cannot access User 2's account"""
    # Create users
    user1 = await create_test_user("user1")
    user2 = await create_test_user("user2")
    
    # User 2 creates account
    account = await create_test_account(user2.id)
    
    # User 1 tries to delete User 2's account
    token = create_access_token(user1.id)
    response = await client.delete(
        f"/accounts/{account.id}",
        headers={"Authorization": f"Bearer {token}"}
    )
    
    assert response.status_code == 404  # Not found, not deleted
```

---

### Fix 2.2: Rate Limiting on Sensitive Endpoints

```python
# backend/utils/limiter.py (already exists, just add more limits)
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)

# In routers/invest.py
from backend.utils.limiter import limiter

@router.post("/invest/live")
@limiter.limit("3/hour")
async def live_invest(
    request: Request,
    # ...
):
    """Can only trigger live invest 3 times per hour"""
    ...

@router.delete("/accounts/{id}")
@limiter.limit("5/hour")
async def delete_account(...):
    """Can only delete 5 accounts per hour"""
    ...

# In routers/auth.py
@router.post("/change-password")
@limiter.limit("5/hour")
async def change_password(...):
    """Can change password max 5 times per hour"""
    ...
```

---

### Fix 2.3: Stronger Password Policy

```python
# backend/utils/auth_utils.py

import re
from typing import Set

# Load common passwords (or use online API)
COMMON_PASSWORDS = {
    "password", "123456", "password123", "admin", "letmein",
    "qwerty", "monkey", "dragon", "master", "soccer"
}

def validate_password(password: str) -> None:
    """
    Validate password meets security requirements.
    Raises HTTPException if invalid.
    """
    if len(password) < 12:
        raise ValueError("Password must be at least 12 characters")
    
    if password.lower() in COMMON_PASSWORDS:
        raise ValueError("Password is too common. Choose a unique passphrase.")
    
    # Check against Have I Been Pwned (optional, requires internet)
    # import httpx
    # async with httpx.AsyncClient() as client:
    #     # Check password hash against HIBP API
    #     pass

def hash_password(password: str) -> str:
    from passlib.context import CryptContext
    
    # First validate
    validate_password(password)
    
    pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
    return pwd_context.hash(password)
```

Use in auth:
```python
@router.post("/register")
async def register(body: RegisterRequest, db: AsyncSession = Depends(get_db)):
    try:
        password_hash = hash_password(body.password)  # Validates here
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    
    # ... rest of registration
```

---

## Phase 3: Medium-Priority Fixes

### Fix 3.1: Security Headers

**File**: `nginx/hyeyield.conf`

```nginx
server {
    listen 443 ssl;
    server_name hyeyield.duckdns.org;

    ssl_certificate     /etc/letsencrypt/live/hyeyield.duckdns.org/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/hyeyield.duckdns.org/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;

    # ADD THESE SECURITY HEADERS
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:;" always;

    # Rest of config...
    root /var/www/hyeyield;
    index index.html;

    location ~ ^/(auth|accounts|schwab|invest|logs|health|schedules)(/|$) {
        proxy_pass         http://127.0.0.1:8000;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

Reload Nginx:
```bash
sudo nginx -t
sudo systemctl reload nginx
```

Verify headers:
```bash
curl -I https://hyeyield.duckdns.org
# Should see:
# strict-transport-security: max-age=31536000; includeSubDomains; preload
# x-frame-options: DENY
# x-content-type-options: nosniff
```

---

### Fix 3.2: Audit Logging

```python
# backend/services/audit.py
import logging
import json
from datetime import datetime

audit_logger = logging.getLogger("audit")

class AuditLog:
    """Structured audit logging"""
    
    @staticmethod
    def log(event_type: str, user_id: int = None, ip: str = None, details: dict = None):
        """Log security event"""
        log_entry = {
            "timestamp": datetime.utcnow().isoformat(),
            "event_type": event_type,
            "user_id": user_id,
            "ip": ip,
            "details": details or {},
        }
        audit_logger.info(json.dumps(log_entry))

    # Specific events
    @staticmethod
    def auth_failure(username: str, ip: str, reason: str):
        AuditLog.log("AUTH_FAILURE", details={"username": username, "reason": reason}, ip=ip)
    
    @staticmethod
    def auth_success(user_id: int, ip: str):
        AuditLog.log("AUTH_SUCCESS", user_id=user_id, ip=ip)
    
    @staticmethod
    def authorization_failure(user_id: int, action: str, resource: str, ip: str):
        AuditLog.log("AUTHZ_FAILURE", user_id=user_id, 
                    details={"action": action, "resource": resource}, ip=ip)
    
    @staticmethod
    def sensitive_operation(user_id: int, action: str, details: dict, ip: str):
        AuditLog.log("OPERATION", user_id=user_id, 
                    details={"action": action, **details}, ip=ip)
```

Use in routers:
```python
from backend.services.audit import AuditLog

@router.post("/auth/login")
@limiter.limit("5/minute")
async def login(request: Request, body: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.username == body.username))
    user = result.scalar_one_or_none()

    if not user or not verify_password(body.password, user.password_hash):
        AuditLog.auth_failure(body.username, request.client.host, "invalid_credentials")
        raise HTTPException(status_code=401, detail="Invalid credentials")

    AuditLog.auth_success(user.id, request.client.host)
    # ... return tokens ...

@router.delete("/accounts/{account_id}")
async def delete_account(...):
    account = await _get_owned_account(account_id, current_user, db)
    
    AuditLog.sensitive_operation(
        current_user.id,
        "DELETE_ACCOUNT",
        {"account_id": account.id, "account_number": account.account_number},
        request.client.host
    )
    
    await db.delete(account)
    await db.commit()
```

Configure logging in `backend/main.py`:
```python
import logging.config

LOGGING_CONFIG = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "default": {
            "format": "%(asctime)s %(levelname)s %(name)s: %(message)s"
        },
        "json": {
            "format": "%(message)s"  # Already JSON from AuditLog
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "default",
        },
        "audit_file": {
            "class": "logging.handlers.RotatingFileHandler",
            "filename": "/var/log/hyeyield/audit.log",
            "maxBytes": 104857600,  # 100MB
            "backupCount": 10,
            "formatter": "json",
        },
    },
    "loggers": {
        "audit": {
            "handlers": ["audit_file"],
            "level": "INFO",
            "propagate": False,
        },
        "": {
            "handlers": ["console"],
            "level": "INFO",
        },
    },
}

logging.config.dictConfig(LOGGING_CONFIG)
```

---

## Testing the Fixes

Run the test suite:
```bash
cd hyeyield
source venv/bin/activate

# Run all tests
pytest backend/tests/ -v

# Run specific test
pytest backend/tests/test_authorization.py::test_user_cannot_access_other_user_account -v

# Test with coverage
pytest backend/tests/ --cov=backend --cov-report=html
```

---

## Deployment Checklist

Before deploying:

- [ ] All .env secrets rotated
- [ ] .env removed from git history
- [ ] Tests passing (pytest)
- [ ] Security headers in place
- [ ] CSRF protection enabled
- [ ] Audit logging configured
- [ ] Database permissions: 600
- [ ] .env permissions: 600
- [ ] UFW firewall configured (22, 80, 443 only)
- [ ] Fail2Ban installed and running
- [ ] SSL certificate valid (certbot auto-renew)

Deploy:
```bash
# On server
cd ~/hyeyield
git pull
source venv/bin/activate
pip install -r requirements.txt
alembic upgrade head
sudo systemctl restart hyeyield
sudo systemctl restart nginx
sudo systemctl status hyeyield

# Verify
curl -I https://hyeyield.duckdns.org
```

---

## References

- [FastAPI Security](https://fastapi.tiangolo.com/tutorial/security/)
- [OWASP CSRF Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
- [NIST Password Guidelines](https://pages.nist.gov/800-63-3/sp800-63b.html)
- [HttpOnly Cookies](https://developer.mozilla.org/en-US/docs/Web/HTTP/Cookies#restrict_access_to_cookies)

