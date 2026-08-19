import re

import jwt
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app.db import engine
from app.redis_client import redis_client
from app.security import (
    REFRESH_TOKEN_TTL_DAYS,
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class SignupRequest(BaseModel):
    email: str = Field(..., max_length=100)
    password: str = Field(..., min_length=8, max_length=72)  # bcrypt는 72바이트를 넘으면 예외를 던진다
    name: str = Field(..., min_length=1, max_length=50)


class LoginRequest(BaseModel):
    email: str = Field(..., max_length=100)
    password: str = Field(..., max_length=72)


class RefreshRequest(BaseModel):
    refresh_token: str


def _store_refresh_token(user_id: int, refresh_token: str) -> None:
    # 재로그인/재발급 시 기존 세션(리프레시 토큰)을 교체한다 — 4.3절 auth:refresh:{userId}
    redis_client.set(
        f"auth:refresh:{user_id}", refresh_token, ex=REFRESH_TOKEN_TTL_DAYS * 24 * 3600
    )


def _invalid_input(message: str):
    return HTTPException(status_code=400, detail={"error": "INVALID_INPUT", "message": message})


def _unauthorized(message: str):
    return HTTPException(status_code=401, detail={"error": "UNAUTHORIZED", "message": message})


@router.post("/signup", status_code=201)
def signup(body: SignupRequest):
    email = body.email.strip().lower()
    if not _EMAIL_RE.match(email):
        raise _invalid_input("invalid email format")
    if len(body.password) < 8:
        raise _invalid_input("password must be at least 8 characters")
    if not body.name.strip():
        raise _invalid_input("name is required")

    password_hash = hash_password(body.password)

    with engine.begin() as conn:
        try:
            result = conn.execute(
                text(
                    "INSERT INTO users (email, password_hash, name) "
                    "VALUES (:email, :password_hash, :name)"
                ),
                {"email": email, "password_hash": password_hash, "name": body.name.strip()},
            )
        except IntegrityError:
            raise _invalid_input("email already registered")
        user_id = result.lastrowid

    return {"user_id": user_id, "email": email, "name": body.name.strip()}


@router.post("/login")
def login(body: LoginRequest):
    email = body.email.strip().lower()

    with engine.connect() as conn:
        user = conn.execute(
            text("SELECT id, password_hash, name FROM users WHERE email = :email"),
            {"email": email},
        ).mappings().first()

    if user is None or not verify_password(body.password, user["password_hash"]):
        raise _unauthorized("invalid email or password")

    user_id = user["id"]
    access_token = create_access_token(user_id)
    refresh_token = create_refresh_token(user_id)
    _store_refresh_token(user_id, refresh_token)

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "expires_in": 30 * 60,
        "name": user["name"],
    }


@router.post("/refresh")
def refresh(body: RefreshRequest):
    try:
        payload = decode_token(body.refresh_token)
    except jwt.ExpiredSignatureError:
        raise _unauthorized("refresh token expired")
    except jwt.InvalidTokenError:
        raise _unauthorized("invalid refresh token")

    if payload.get("type") != "refresh":
        raise _unauthorized("not a refresh token")

    user_id = int(payload["sub"])

    # Redis에 저장된 것과 달라졌다면(재로그인 등으로 세션이 교체됨) 이 리프레시 토큰은 더 이상 유효하지 않다.
    stored = redis_client.get(f"auth:refresh:{user_id}")
    if stored != body.refresh_token:
        raise _unauthorized("refresh token has been superseded or revoked")

    access_token = create_access_token(user_id)
    new_refresh_token = create_refresh_token(user_id)
    _store_refresh_token(user_id, new_refresh_token)

    return {
        "access_token": access_token,
        "refresh_token": new_refresh_token,
        "token_type": "bearer",
        "expires_in": 30 * 60,
    }
