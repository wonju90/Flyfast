import os
import secrets
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

JWT_SECRET = os.getenv("JWT_SECRET", "dev-insecure-secret-change-me")
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_TTL_MINUTES = 30
# 4.3절 Redis 키 설계: auth:refresh:{userId}, TTL 14일
REFRESH_TOKEN_TTL_DAYS = 14


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))


def create_access_token(user_id) -> str:
    payload = {
        "sub": str(user_id),
        "type": "access",
        # exp는 초 단위 정밀도라, 같은 초 안에 발급된 토큰끼리 payload가 완전히 같아지는 걸
        # 막기 위해 jti(고유 토큰 ID)를 넣는다 — 없으면 리프레시 토큰 교체가 무력화될 수 있다.
        "jti": secrets.token_hex(8),
        "exp": datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_TTL_MINUTES),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def create_refresh_token(user_id) -> str:
    payload = {
        "sub": str(user_id),
        "type": "refresh",
        "jti": secrets.token_hex(8),
        "exp": datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_TTL_DAYS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> dict:
    return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
