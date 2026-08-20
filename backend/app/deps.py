from typing import Optional

import jwt
from fastapi import Header, HTTPException

from app.security import decode_token


def _unauthorized(message: str):
    return HTTPException(status_code=401, detail={"error": "UNAUTHORIZED", "message": message})


def get_current_user_id(authorization: str = Header(None)) -> int:
    if not authorization or not authorization.startswith("Bearer "):
        raise _unauthorized("missing bearer token")

    token = authorization[len("Bearer "):]
    try:
        payload = decode_token(token)
    except jwt.ExpiredSignatureError:
        raise _unauthorized("access token expired")
    except jwt.InvalidTokenError:
        raise _unauthorized("invalid access token")

    if payload.get("type") != "access":
        raise _unauthorized("not an access token")

    return int(payload["sub"])


def get_optional_user_id(authorization: str = Header(None)) -> Optional[int]:
    # 검색처럼 비로그인 사용자도 써야 하는 엔드포인트에서, 로그인 상태면 user_id를 얻고
    # 아니면(토큰 없음/만료/무효) 그냥 None으로 넘어가 익명 요청으로 처리하기 위한 버전.
    if not authorization or not authorization.startswith("Bearer "):
        return None

    token = authorization[len("Bearer "):]
    try:
        payload = decode_token(token)
    except jwt.InvalidTokenError:
        return None

    if payload.get("type") != "access":
        return None

    return int(payload["sub"])
