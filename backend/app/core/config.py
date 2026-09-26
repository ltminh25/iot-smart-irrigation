from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    DB_URL: str = "sqlite:///./iot_plant_care.db"
    JWT_SECRET: str = "supersecret_change_in_production"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    MQTT_BROKER_URL: str = "broker.hivemq.com"
    MQTT_PORT: int = 1883
    MQTT_USERNAME: str = ""
    MQTT_PASSWORD: str = ""
    MAX_LOGIN_ATTEMPTS: int = 5
    HEARTBEAT_TIMEOUT_SECONDS: int = 30
    HEARTBEAT_CHECK_INTERVAL: int = 10

    class Config:
        env_file = ".env"

settings = Settings()
