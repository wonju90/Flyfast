from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import text

from app.db import engine
from app.deps import get_current_user_id
from app.redis_client import redis_client
from app.redis_keys import seat_hold_key

router = APIRouter(prefix="/api/v1", tags=["seats"])

# 4.3절 Redis 키 설계: seat:hold:{scheduleId}:{seatNo}, TTL 10분
HOLD_TTL_SECONDS = 600

# 소유자(holder_id)가 일치할 때만 원자적으로 삭제 — 다른 사용자가 남의 선점을 해제하지 못하게 막는다.
_RELEASE_IF_OWNER = """
if redis.call('get', KEYS[1]) == ARGV[1] then
    return redis.call('del', KEYS[1])
else
    return 0
end
"""


class SeatHoldRequest(BaseModel):
    seat_no: str = Field(..., min_length=1, max_length=10)


def _not_found(message: str):
    return HTTPException(status_code=404, detail={"error": "FLIGHT_NOT_FOUND", "message": message})


def _conflict(message: str):
    return HTTPException(status_code=409, detail={"error": "SEAT_ALREADY_HELD", "message": message})


def _expired(message: str):
    return HTTPException(status_code=410, detail={"error": "HOLD_EXPIRED", "message": message})


def _forbidden(message: str):
    return HTTPException(status_code=403, detail={"error": "FORBIDDEN", "message": message})


@router.post("/schedules/{schedule_id}/seats/hold", status_code=201)
def hold_seat(
    schedule_id: int,
    body: SeatHoldRequest,
    current_user_id: int = Depends(get_current_user_id),
):
    seat_no = body.seat_no.strip().upper()
    holder_id = str(current_user_id)

    with engine.connect() as conn:
        schedule = conn.execute(
            text("SELECT id FROM flight_schedules WHERE id = :id"),
            {"id": schedule_id},
        ).first()
        if schedule is None:
            raise _not_found(f"schedule {schedule_id} not found")

        seat = conn.execute(
            text(
                "SELECT status FROM seats WHERE schedule_id = :schedule_id AND seat_no = :seat_no"
            ),
            {"schedule_id": schedule_id, "seat_no": seat_no},
        ).mappings().first()
        if seat is None:
            raise _not_found(f"seat {seat_no} not found on schedule {schedule_id}")
        if seat["status"] == "SOLD":
            raise _conflict(f"seat {seat_no} is already sold")

    # 실시간 동시성 제어는 Redis가 담당 (DB seats.status는 예약 확정 시점에만 SOLD로 갱신)
    key = seat_hold_key(schedule_id, seat_no)
    acquired = redis_client.set(key, holder_id, nx=True, ex=HOLD_TTL_SECONDS)
    if not acquired:
        raise _conflict(f"seat {seat_no} is already held by another user")

    return {
        "schedule_id": schedule_id,
        "seat_no": seat_no,
        "expires_in": HOLD_TTL_SECONDS,
    }


@router.delete("/schedules/{schedule_id}/seats/hold")
def release_seat_hold(
    schedule_id: int,
    body: SeatHoldRequest,
    current_user_id: int = Depends(get_current_user_id),
):
    seat_no = body.seat_no.strip().upper()
    holder_id = str(current_user_id)
    key = seat_hold_key(schedule_id, seat_no)

    current = redis_client.get(key)
    if current is None:
        raise _expired(f"hold for seat {seat_no} not found or already expired")
    if current != holder_id:
        raise _forbidden("only the holder can release this seat hold")

    released = redis_client.eval(_RELEASE_IF_OWNER, 1, key, holder_id)
    if not released:
        raise _expired(f"hold for seat {seat_no} not found or already expired")

    return {"schedule_id": schedule_id, "seat_no": seat_no, "released": True}
