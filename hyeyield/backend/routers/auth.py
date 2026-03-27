from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_db
from backend.models.user import User
from backend.schemas.auth import AuthResponse, ChangePasswordRequest, LoginRequest, RegisterRequest, UserProfile, UserUpdate
from backend.utils.auth_utils import hash_password, verify_password
from backend.utils.jwt_utils import create_access_token, get_current_user

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=AuthResponse)
async def register(body: RegisterRequest, db: AsyncSession = Depends(get_db)):
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

    return AuthResponse(access_token=create_access_token(user.id))


@router.post("/login", response_model=AuthResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.username == body.username))
    user = result.scalar_one_or_none()

    # Always return 401 — never reveal whether username or password was wrong
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    return AuthResponse(access_token=create_access_token(user.id))


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
    if len(body.new_password) < 8:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="New password must be at least 8 characters")
    current_user.password_hash = hash_password(body.new_password)
    await db.commit()


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
async def delete_account(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await db.delete(current_user)
    await db.commit()


@router.post("/ntfy-test", status_code=status.HTTP_204_NO_CONTENT)
async def ntfy_test(current_user: User = Depends(get_current_user)):
    if not current_user.ntfy_topic:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="No ntfy topic configured")
    from backend.services.notify import send_notify
    await send_notify(current_user.ntfy_topic, "Hye-Yield: Test notification", "Your push notifications are working correctly.")
