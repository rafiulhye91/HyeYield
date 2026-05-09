from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import JSONResponse
from backend.utils.limiter import limiter
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_db
from backend.models.user import User
from backend.schemas.auth import AuthResponse, ChangePasswordRequest, LoginRequest, RegisterRequest, UserProfile, UserUpdate
from backend.utils.auth_utils import hash_password, verify_password
from backend.utils.jwt_utils import create_access_token, create_refresh_token, decode_token, get_current_user
from backend.config import settings
from backend.services.audit import AuditLog

router = APIRouter(prefix="/auth", tags=["auth"])


def _set_auth_cookies(response: JSONResponse, access_token: str, refresh_token: str):
    """Set secure httpOnly cookies"""
    response.set_cookie(
        "access_token",
        access_token,
        httponly=True,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
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


@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register(body: RegisterRequest, db: AsyncSession = Depends(get_db)):
    """Register new user with secure cookie auth"""
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

    response = JSONResponse(content={"success": True}, status_code=status.HTTP_201_CREATED)
    _set_auth_cookies(response, access_token, refresh_token)
    return response


@router.post("/login", status_code=status.HTTP_200_OK)
@limiter.limit("5/minute")
async def login(request: Request, body: LoginRequest, db: AsyncSession = Depends(get_db)):
    """Login with httpOnly cookies (not JSON tokens)"""
    result = await db.execute(select(User).where(User.username == body.username))
    user = result.scalar_one_or_none()

    # Always return 401 — never reveal whether username or password was wrong
    if not user or not verify_password(body.password, user.password_hash):
        await AuditLog.auth_failure(body.username, request.client.host, "invalid_credentials", db)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    await AuditLog.auth_success(user.id, request.client.host, db)

    access_token = create_access_token(user.id)
    refresh_token = create_refresh_token(user.id)

    response = JSONResponse(content={"success": True})
    _set_auth_cookies(response, access_token, refresh_token)
    return response


@router.post("/refresh", status_code=status.HTTP_200_OK)
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
async def logout():
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
    """Get current user profile"""
    return _user_profile(current_user)


@router.put("/me", response_model=UserProfile)
async def update_me(
    body: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update user profile"""
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
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Change user password"""
    if not verify_password(body.current_password, current_user.password_hash):
        await AuditLog.authorization_failure(
            current_user.id, "change_password", "invalid_current_password", request.client.host, db
        )
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect")
    if len(body.new_password) < 12:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="New password must be at least 12 characters")
    current_user.password_hash = hash_password(body.new_password)
    await db.commit()
    await AuditLog.sensitive_operation(current_user.id, "CHANGE_PASSWORD", {}, request.client.host, db)


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
async def delete_account(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete user account"""
    await AuditLog.sensitive_operation(
        current_user.id, "DELETE_ACCOUNT", {"username": current_user.username}, request.client.host, db
    )
    await db.delete(current_user)
    await db.commit()

    response = JSONResponse(content={"success": True}, status_code=204)
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return response


@router.post("/ntfy-test", status_code=status.HTTP_204_NO_CONTENT)
async def ntfy_test(current_user: User = Depends(get_current_user)):
    """Send test notification"""
    if not current_user.ntfy_topic:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="No ntfy topic configured")
    from backend.services.notify import send_notify
    await send_notify(current_user.ntfy_topic, "Hye-Yield: Test notification", "Your push notifications are working correctly.")
