from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    secret_key: str
    encrypt_key: str
    environment: str = "dev"
    jwt_expire_hours: int = 24

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
