"""Centralised settings. Production-critical values are validated at startup."""
import logging
import secrets
from functools import lru_cache
from typing import Literal

from pydantic import Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

log = logging.getLogger("gitarchey.config")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # app
    app_env: Literal["development", "test", "production"] = "development"
    host: str = "127.0.0.1"
    port: int = 8000
    log_level: str = "INFO"
    allowed_origins: list[str] = ["http://localhost:3000"]
    allowed_hosts: list[str] = ["localhost", "127.0.0.1", "testserver"]
    max_request_body_bytes: int = 2_000_000  # JSON bodies
    max_upload_bytes: int = 5_000_000  # multipart bodies

    # jwt
    jwt_secret: SecretStr = SecretStr("")
    jwt_algorithm: Literal["HS256", "HS384", "HS512"] = "HS256"
    jwt_issuer: str = "gitarchey"
    jwt_audience: str = "gitarchey-api"
    jwt_expiry_minutes: int = Field(30, ge=1, le=1440)

    # database: "astra" (default, required in prod) or "memory" (explicit opt-in, never in prod)
    database_backend: Literal["astra", "memory"] = "astra"
    astra_secure_bundle_path: str = ""
    astra_application_token: SecretStr = SecretStr("")
    astra_keyspace: str = ""
    astra_auto_migrate: bool = False
    astra_connect_timeout_s: float = 15.0
    astra_request_timeout_s: float = 10.0

    # git
    git_executable: str = "git"
    git_repos_dir: str = "data/git-repositories"
    git_timeout_s: float = 20.0
    git_max_output_bytes: int = 2_000_000
    git_max_file_bytes: int = 1_000_000
    git_max_diff_bytes: int = 500_000
    git_author_email: str = "noreply@gitarchey.local"

    # r2
    r2_account_id: str = ""
    r2_access_key_id: str = ""
    r2_secret_access_key: SecretStr = SecretStr("")
    r2_bucket_name: str = ""
    r2_endpoint_url: str = ""
    external_timeout_s: float = 10.0

    # cloudinary
    cloudinary_cloud_name: str = ""
    cloudinary_api_key: str = ""
    cloudinary_api_secret: SecretStr = SecretStr("")
    avatar_max_bytes: int = 2_000_000
    avatar_max_pixels: int = 4_000_000

    # rate limiting (limits-library syntax). memory:// is per process.
    rate_limit_enabled: bool = True
    rate_limit_storage_uri: str = "memory://"
    rl_register: str = "5/minute"
    rl_login: str = "10/minute"
    rl_repo_create: str = "20/hour"
    rl_repo_delete: str = "20/hour"
    rl_commit: str = "60/minute"
    rl_upload: str = "20/hour"
    rl_analytics_submit: str = "10/hour"
    rl_ws_connect: str = "30/minute"
    rl_default_authed: str = "300/minute"
    rl_default_anon: str = "60/minute"
    trust_proxy_headers: bool = False

    # workers / analytics
    worker_token: SecretStr = SecretStr("")
    worker_heartbeat_interval_s: float = 15.0
    worker_heartbeat_timeout_s: float = 45.0
    analytics_max_job_seconds: int = 900
    analytics_max_concurrent_per_user: int = 2
    analytics_max_concurrent_total: int = 4
    analytics_max_dataset_rows: int = 50_000
    analytics_max_dataset_bytes: int = 5_000_000
    analytics_max_attempts: int = 3

    @property
    def is_prod(self) -> bool:
        return self.app_env == "production"

    @model_validator(mode="after")
    def _validate(self) -> "Settings":
        secret = self.jwt_secret.get_secret_value()
        if self.is_prod:
            errs = []
            if self.database_backend != "astra":
                errs.append("DATABASE_BACKEND must be 'astra' in production")
            if len(secret) < 32:
                errs.append("JWT_SECRET must be >= 32 chars")
            if "*" in self.allowed_origins:
                errs.append("ALLOWED_ORIGINS must not contain '*'")
            if "*" in self.allowed_hosts:
                errs.append("ALLOWED_HOSTS must not contain '*'")
            wt = self.worker_token.get_secret_value()
            if wt and len(wt) < 32:
                errs.append("WORKER_TOKEN must be >= 32 chars")
            if errs:
                raise ValueError("; ".join(errs))
        elif len(secret) < 32:
            # dev/test only: ephemeral secret, tokens die on restart
            object.__setattr__(self, "jwt_secret", SecretStr(secrets.token_urlsafe(48)))
            log.warning("JWT_SECRET unset/short: using an ephemeral dev secret")
        if self.database_backend == "astra":
            missing = [n for n, v in (
                ("ASTRA_SECURE_BUNDLE_PATH", self.astra_secure_bundle_path),
                ("ASTRA_APPLICATION_TOKEN", self.astra_application_token.get_secret_value()),
                ("ASTRA_KEYSPACE", self.astra_keyspace)) if not v]
            if missing:
                raise ValueError(f"DATABASE_BACKEND=astra but missing: {', '.join(missing)} "
                                 "(set DATABASE_BACKEND=memory for local development only)")
        return self

    @property
    def r2_configured(self) -> bool:
        return all([self.r2_access_key_id, self.r2_secret_access_key.get_secret_value(),
                    self.r2_bucket_name, self.r2_endpoint_url or self.r2_account_id])

    @property
    def cloudinary_configured(self) -> bool:
        return all([self.cloudinary_cloud_name, self.cloudinary_api_key,
                    self.cloudinary_api_secret.get_secret_value()])

    @property
    def workers_enabled(self) -> bool:
        return bool(self.worker_token.get_secret_value())


@lru_cache
def get_settings() -> Settings:
    return Settings()
