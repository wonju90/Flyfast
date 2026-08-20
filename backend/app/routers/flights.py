from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text

from app.db import engine
from app.deps import get_optional_user_id

router = APIRouter(prefix="/api/v1", tags=["flights"])

# 5.1절 응답 코드 표에서 422는 FARE_CHANGED(결제 단계) 전용으로 이미 예약되어 있어
# FastAPI 기본 자동검증(422)과 겹치지 않도록, 이 라우터는 파라미터를 문자열로 받아
# 직접 검증한 뒤 400 INVALID_INPUT으로만 응답한다.

_SEARCH_SQL = text(
    """
    SELECT
        fs.id AS schedule_id,
        f.flight_no,
        f.origin,
        f.destination,
        fs.depart_at,
        fs.arrival_at,
        COUNT(CASE WHEN s.status = 'AVAILABLE' THEN 1 END) AS remaining_seats,
        (SELECT MIN(amount) FROM fares WHERE fares.schedule_id = fs.id) AS from_price
    FROM flight_schedules fs
    JOIN flights f ON f.id = fs.flight_id
    LEFT JOIN seats s ON s.schedule_id = fs.id
    WHERE f.origin = :origin
      AND f.destination = :destination
      AND fs.depart_at >= :depart_start
      AND fs.depart_at < :depart_end
    GROUP BY fs.id, f.id, f.flight_no, f.origin, f.destination, fs.depart_at, fs.arrival_at
    ORDER BY fs.depart_at ASC
    """
)


def _invalid_input(message: str):
    return HTTPException(status_code=400, detail={"error": "INVALID_INPUT", "message": message})


def _not_found(message: str):
    return HTTPException(status_code=404, detail={"error": "FLIGHT_NOT_FOUND", "message": message})


def _parse_date(value: str, field: str) -> datetime:
    try:
        return datetime.strptime(value, "%Y-%m-%d")
    except ValueError:
        raise _invalid_input(f"{field} must be in YYYY-MM-DD format")


def _search_one_way(conn, origin: str, destination: str, day: datetime):
    rows = conn.execute(
        _SEARCH_SQL,
        {
            "origin": origin,
            "destination": destination,
            "depart_start": day,
            "depart_end": day + timedelta(days=1),
        },
    ).mappings().all()
    return [dict(row) for row in rows]


def _record_search_history(conn, user_id: int, origin, destination, depart_day, return_day, adults):
    # <=> (null-safe equal)로 조회한다 — return_date가 NULL인 편도 검색을 반복해도 매번 새 행이
    # 쌓이지 않고 updated_at만 갱신되게 하기 위해서다 (일반 = 비교는 NULL과 절대 안 맞는다).
    existing = conn.execute(
        text(
            "SELECT id, is_favorite FROM search_history "
            "WHERE user_id = :user_id AND origin = :origin AND destination = :destination "
            "AND depart_date = :depart_date AND return_date <=> :return_date AND adults = :adults"
        ),
        {
            "user_id": user_id,
            "origin": origin,
            "destination": destination,
            "depart_date": depart_day.date(),
            "return_date": return_day.date() if return_day else None,
            "adults": adults,
        },
    ).mappings().first()

    if existing:
        conn.execute(
            text("UPDATE search_history SET updated_at = NOW() WHERE id = :id"),
            {"id": existing["id"]},
        )
        return existing["id"], bool(existing["is_favorite"])

    result = conn.execute(
        text(
            "INSERT INTO search_history (user_id, origin, destination, depart_date, return_date, adults) "
            "VALUES (:user_id, :origin, :destination, :depart_date, :return_date, :adults)"
        ),
        {
            "user_id": user_id,
            "origin": origin,
            "destination": destination,
            "depart_date": depart_day.date(),
            "return_date": return_day.date() if return_day else None,
            "adults": adults,
        },
    )
    return result.lastrowid, False


@router.get("/flights/search")
def search_flights(
    origin: str = Query(...),
    destination: str = Query(...),
    depart: str = Query(...),
    adults: int = Query(1),
    direct: bool = Query(True),
    return_date: Optional[str] = Query(None, alias="return"),
    current_user_id: Optional[int] = Depends(get_optional_user_id),
):
    origin = origin.strip().upper()
    destination = destination.strip().upper()

    if not origin or not destination:
        raise _invalid_input("origin and destination are required")
    if origin == destination:
        raise _invalid_input("origin and destination must differ")
    if not (1 <= adults <= 9):
        raise _invalid_input("adults must be between 1 and 9")

    depart_day = _parse_date(depart, "depart")
    return_day = _parse_date(return_date, "return") if return_date else None

    with engine.begin() as conn:
        outbound = _search_one_way(conn, origin, destination, depart_day)
        inbound = _search_one_way(conn, destination, origin, return_day) if return_day else None

        history_id = is_favorite = None
        if current_user_id is not None:
            history_id, is_favorite = _record_search_history(
                conn, current_user_id, origin, destination, depart_day, return_day, adults
            )

    result = {
        "origin": origin,
        "destination": destination,
        "depart": depart,
        "adults": adults,
        "direct": direct,
        "outbound": outbound,
    }
    if return_date:
        result["return"] = return_date
        result["inbound"] = inbound
    if current_user_id is not None:
        result["history_id"] = history_id
        result["is_favorite"] = is_favorite
    return result


# /flights/search와 마찬가지로 {schedule_id}보다 먼저 등록해야 한다 —
# "price-calendar"라는 문자열이 int 경로 파라미터로 잡혀 422가 나는 것을 막기 위함.
@router.get("/flights/price-calendar")
def price_calendar(
    origin: str = Query(...),
    destination: str = Query(...),
    start: str = Query(...),
    end: str = Query(...),
):
    origin = origin.strip().upper()
    destination = destination.strip().upper()

    if not origin or not destination:
        raise _invalid_input("origin and destination are required")
    if origin == destination:
        raise _invalid_input("origin and destination must differ")

    start_day = _parse_date(start, "start")
    end_day = _parse_date(end, "end")
    if end_day < start_day:
        raise _invalid_input("end must not be before start")
    if (end_day - start_day).days > 92:
        raise _invalid_input("date range must not exceed 92 days")

    with engine.connect() as conn:
        rows = conn.execute(
            text(
                """
                SELECT DATE(fs.depart_at) AS d, MIN(fr.amount) AS min_price
                FROM flight_schedules fs
                JOIN flights f ON f.id = fs.flight_id
                JOIN fares fr ON fr.schedule_id = fs.id
                WHERE f.origin = :origin
                  AND f.destination = :destination
                  AND fs.depart_at >= :start
                  AND fs.depart_at < :end_exclusive
                GROUP BY d
                ORDER BY d
                """
            ),
            {
                "origin": origin,
                "destination": destination,
                "start": start_day,
                "end_exclusive": end_day + timedelta(days=1),
            },
        ).mappings().all()

    return {
        "origin": origin,
        "destination": destination,
        "prices": {row["d"].isoformat(): row["min_price"] for row in rows},
    }


# /flights/search 뒤에 등록해야 한다 — 먼저 등록되면 "search"가 {schedule_id}로 잡혀버린다.
# id는 flights.id가 아니라 flight_schedules.id다: 잔여 좌석은 스케줄(특정 날짜 운항편) 단위로만
# 의미가 있고, search 응답의 schedule_id를 그대로 이어받아 상세를 열람하는 흐름이기 때문.
@router.get("/flights/{schedule_id}")
def flight_detail(schedule_id: int):
    with engine.connect() as conn:
        schedule = conn.execute(
            text(
                "SELECT fs.id AS schedule_id, f.flight_no, f.origin, f.destination, "
                "fs.depart_at, fs.arrival_at "
                "FROM flight_schedules fs "
                "JOIN flights f ON f.id = fs.flight_id "
                "WHERE fs.id = :id"
            ),
            {"id": schedule_id},
        ).mappings().first()
        if schedule is None:
            raise _not_found(f"schedule {schedule_id} not found")

        seats = conn.execute(
            text(
                "SELECT seat_no, seat_class, status FROM seats WHERE schedule_id = :id ORDER BY seat_no"
            ),
            {"id": schedule_id},
        ).mappings().all()

        fares = conn.execute(
            text("SELECT seat_class, amount FROM fares WHERE schedule_id = :id"),
            {"id": schedule_id},
        ).mappings().all()

    fare_by_class = {f["seat_class"]: f["amount"] for f in fares}
    remaining_seats = sum(1 for s in seats if s["status"] == "AVAILABLE")

    return {
        **dict(schedule),
        "remaining_seats": remaining_seats,
        "fares": fare_by_class,
        "seats": [
            {**dict(s), "fare": fare_by_class.get(s["seat_class"])} for s in seats
        ],
    }
