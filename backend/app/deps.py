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
