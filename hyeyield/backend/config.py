from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    secret_key: str
    encrypt_key: str
    environment: str = "dev"
    jwt_expire_hours: int = 1  # Short-lived access tokens (1 hour)
    jwt_refresh_expire_days: int = 7  # Long-lived refresh tokens (7 days)

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"

    @property
    def cookie_secure(self) -> bool:
        """HTTPS only in production"""
        return self.environment == "prod"

    @property
    def cookie_samesite(self) -> str:
        """CSRF protection"""
        return "strict"


settings = Settings()
