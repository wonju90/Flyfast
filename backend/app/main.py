import os
import socket

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.db import engine
from app.redis_client import redis_client
from app.routers.airports import router as airports_router
from app.routers.auth import router as auth_router
from app.routers.bookings import router as bookings_router
from app.routers.flights import router as flights_router
from app.routers.seats import router as seats_router

# CI/CD 도입 전까지는 배포할 때 이 값을 손으로 올린다. 파이프라인이 생기면
# 빌드 시 APP_VERSION 환경변수(git tag/커밋 SHA 등)로 덮어쓰면 코드 변경 없이 넘어간다.
APP_VERSION = os.getenv("APP_VERSION", "0.1.0")

app = FastAPI(title="Flyfast API")

# 로컬 개발: 프론트(Vite, 5173)와 백엔드(8000)가 다른 포트라 브라우저 fetch는 CORS를 탄다.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(airports_router)
app.include_router(flights_router)
app.include_router(seats_router)
app.include_router(bookings_router)


# 5.1절 응답 코드 표에서 422는 FARE_CHANGED(결제 단계) 전용으로 예약되어 있어,
# FastAPI 기본 요청 검증 실패(422)가 그 의미와 겹치지 않도록 400 INVALID_INPUT으로 통일한다.
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request, exc):
    # 다른 모든 에러 경로(HTTPException)는 {"detail": {...}} 형태로 내려가므로,
    # 프론트가 detail만 보고도 처리할 수 있도록 이 핸들러도 같은 모양으로 맞춘다.
    return JSONResponse(
        status_code=400,
        content={"detail": {"error": "INVALID_INPUT", "message": exc.errors()}},
    )


@app.get("/api/health")
def health():
    db_ok = False
    redis_ok = False

    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        db_ok = True
    except Exception:
        db_ok = False

    try:
        redis_ok = redis_client.ping()
    except Exception:
        redis_ok = False

    try:
        server_ip = socket.gethostbyname(socket.gethostname())
    except Exception:
        server_ip = None

    return {
        "status": "ok",
        "db": db_ok,
        "redis": redis_ok,
        "version": APP_VERSION,
        "server_ip": server_ip,
    }
