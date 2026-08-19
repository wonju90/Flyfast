import uuid
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app.db import engine
from app.deps import get_current_user_id
from app.pricing import get_fare
from app.redis_client import redis_client
from app.redis_keys import seat_hold_key

router = APIRouter(prefix="/api/v1", tags=["bookings"])


class PassengerInput(BaseModel):
    seat_no: str = Field(..., min_length=1, max_length=10)
    name: str = Field(..., min_length=1, max_length=30)


class BookingCreateRequest(BaseModel):
    schedule_id: int
    passengers: List[PassengerInput]


class PaymentRequest(BaseModel):
    # amount는 클라이언트에서 받지 않는다 — 결제 금액은 fares 테이블 기준으로 서버가 직접 계산한다
    # (그렇지 않으면 Mock 결제라도 클라이언트가 임의 금액을 불러 결제할 수 있는 구멍이 생긴다).
    simulate: str = "success"  # "success" | "fail" — 실제 PG 연동 없는 Mock 결제 (1.3절 개발 범위)


def _not_found(message: str):
    return HTTPException(status_code=404, detail={"error": "FLIGHT_NOT_FOUND", "message": message})


def _invalid_input(message: str):
    return HTTPException(status_code=400, detail={"error": "INVALID_INPUT", "message": message})


def _conflict(message: str):
    return HTTPException(status_code=409, detail={"error": "SEAT_ALREADY_HELD", "message": message})


def _expired(message: str):
    return HTTPException(status_code=410, detail={"error": "HOLD_EXPIRED", "message": message})


def _forbidden(message: str):
    return HTTPException(status_code=403, detail={"error": "FORBIDDEN", "message": message})


def _generate_booking_no() -> str:
    return "FF" + uuid.uuid4().hex[:10].upper()


@router.post("/bookings", status_code=201)
def create_booking(
    body: BookingCreateRequest,
    current_user_id: int = Depends(get_current_user_id),
):
    if not body.passengers:
        raise _invalid_input("passengers must contain at least one entry")

    seat_nos = [p.seat_no.strip().upper() for p in body.passengers]
    if len(seat_nos) != len(set(seat_nos)):
        # UNIQUE(seat_id)에 걸려 "다른 사용자가 이미 예약함"으로 오해되는 409가 나가기 전에,
        # 같은 요청 안의 중복임을 명확히 구분해서 알려준다.
        raise _invalid_input("duplicate seat_no in passengers list")

    holder_id = str(current_user_id)

    with engine.begin() as conn:
        schedule = conn.execute(
            text("SELECT id FROM flight_schedules WHERE id = :id"),
            {"id": body.schedule_id},
        ).first()
        if schedule is None:
            raise _not_found(f"schedule {body.schedule_id} not found")

        user = conn.execute(
            text("SELECT id FROM users WHERE id = :id"), {"id": current_user_id}
        ).first()
        if user is None:
            raise HTTPException(
                status_code=401,
                detail={"error": "UNAUTHORIZED", "message": "user for this token no longer exists"},
            )

        seat_ids = {}
        amount = 0
        for p in body.passengers:
            seat_no = p.seat_no.strip().upper()

            # 선점(hold) 검증 — 로그인한 본인이 지금 이 좌석을 들고 있어야만 예약을 만들 수 있다.
            # 결제 전까지는 hold를 소비하지 않는다 (410 HOLD_EXPIRED는 명세서상 결제 시점 오류이므로).
            hold_value = redis_client.get(seat_hold_key(body.schedule_id, seat_no))
            if hold_value is None:
                raise _expired(f"hold for seat {seat_no} not found or already expired")
            if hold_value != holder_id:
                raise _forbidden(f"seat {seat_no} is held by another user")

            seat = conn.execute(
                text(
                    "SELECT id, seat_class, status FROM seats "
                    "WHERE schedule_id = :schedule_id AND seat_no = :seat_no"
                ),
                {"schedule_id": body.schedule_id, "seat_no": seat_no},
            ).mappings().first()
            if seat is None:
                raise _not_found(f"seat {seat_no} not found on schedule {body.schedule_id}")
            if seat["status"] == "SOLD":
                raise _conflict(f"seat {seat_no} is already sold")

            amount += get_fare(conn, body.schedule_id, seat["seat_class"])

            # 우리가 방금 Redis에서 이 좌석의 유효한 hold를 확인했고 DB status도 SOLD가 아니므로,
            # passengers에 이 seat_id를 참조하는 행이 남아있다면 그건 결제 없이 방치된(hold가 만료된)
            # 예전 PENDING 예약의 잔재다. UNIQUE(seat_id) 때문에 지우지 않으면 새 예약을 못 만든다.
            stale = conn.execute(
                text("SELECT booking_id FROM passengers WHERE seat_id = :seat_id"),
                {"seat_id": seat["id"]},
            ).mappings().first()
            if stale is not None:
                conn.execute(
                    text("DELETE FROM passengers WHERE seat_id = :seat_id"),
                    {"seat_id": seat["id"]},
                )
                conn.execute(
                    text(
                        "UPDATE bookings SET status = 'CANCELLED' "
                        "WHERE id = :bid AND status = 'PENDING'"
                    ),
                    {"bid": stale["booking_id"]},
                )

            seat_ids[seat_no] = seat["id"]

        booking_no = _generate_booking_no()
        result = conn.execute(
            text(
                "INSERT INTO bookings (booking_no, schedule_id, user_id, status) "
                "VALUES (:booking_no, :schedule_id, :user_id, 'PENDING')"
            ),
            {
                "booking_no": booking_no,
                "schedule_id": body.schedule_id,
                "user_id": current_user_id,
            },
        )
        booking_id = result.lastrowid

        try:
            for p in body.passengers:
                seat_no = p.seat_no.strip().upper()
                conn.execute(
                    text(
                        "INSERT INTO passengers (booking_id, seat_id, name) "
                        "VALUES (:booking_id, :seat_id, :name)"
                    ),
                    {"booking_id": booking_id, "seat_id": seat_ids[seat_no], "name": p.name},
                )
        except IntegrityError:
            # UNIQUE(seat_id) 제약 — 동시에 같은 좌석으로 다른 예약이 먼저 들어간 경우의 최후 방어선
            raise _conflict("one or more seats were already booked by someone else")

    return {
        "booking_id": booking_id,
        "booking_no": booking_no,
        "status": "PENDING",
        "schedule_id": body.schedule_id,
        "amount": amount,
        "passengers": [
            {"seat_no": p.seat_no.strip().upper(), "name": p.name} for p in body.passengers
        ],
    }


@router.post("/bookings/{booking_id}/payments")
def confirm_payment(
    booking_id: int,
    body: PaymentRequest,
    current_user_id: int = Depends(get_current_user_id),
):
    if body.simulate not in ("success", "fail"):
        raise _invalid_input("simulate must be 'success' or 'fail'")

    with engine.begin() as conn:
        booking = conn.execute(
            text("SELECT id, schedule_id, user_id, status FROM bookings WHERE id = :id"),
            {"id": booking_id},
        ).mappings().first()
        if booking is None:
            raise _not_found(f"booking {booking_id} not found")
        if booking["user_id"] != current_user_id:
            raise _forbidden("this booking does not belong to the current user")
        if booking["status"] == "CONFIRMED":
            return {"booking_id": booking_id, "status": "CONFIRMED", "message": "already confirmed"}
        if booking["status"] == "CANCELLED":
            raise _invalid_input("cannot pay for a cancelled booking")

        passengers = conn.execute(
            text(
                "SELECT p.seat_id, s.schedule_id, s.seat_no, s.seat_class "
                "FROM passengers p JOIN seats s ON s.id = p.seat_id "
                "WHERE p.booking_id = :booking_id"
            ),
            {"booking_id": booking_id},
        ).mappings().all()

        for row in passengers:
            key = seat_hold_key(row["schedule_id"], row["seat_no"])
            if redis_client.get(key) is None:
                raise _expired(f"hold for seat {row['seat_no']} expired before payment")

        if body.simulate == "fail":
            # payments.UNIQUE(booking_id)는 "예약당 유효 결제 1건"을 위한 제약이라
            # 실패 시도는 행을 남기지 않는다 — 남기면 이후 성공 재시도가 유니크 충돌로 영구히 막힌다.
            return {"booking_id": booking_id, "status": "PENDING", "payment_status": "FAILED"}

        # 결제 금액은 좌석 클래스별 fares 테이블 기준으로 서버가 직접 합산한다.
        amount = sum(get_fare(conn, row["schedule_id"], row["seat_class"]) for row in passengers)

        try:
            conn.execute(
                text(
                    "INSERT INTO payments (booking_id, amount, status) "
                    "VALUES (:booking_id, :amount, 'PAID')"
                ),
                {"booking_id": booking_id, "amount": amount},
            )
        except IntegrityError:
            return {"booking_id": booking_id, "status": "CONFIRMED", "message": "already confirmed"}

        for row in passengers:
            conn.execute(
                text("UPDATE seats SET status = 'SOLD' WHERE id = :id"),
                {"id": row["seat_id"]},
            )

        conn.execute(
            text("UPDATE bookings SET status = 'CONFIRMED' WHERE id = :id"),
            {"id": booking_id},
        )

        for row in passengers:
            redis_client.delete(seat_hold_key(row["schedule_id"], row["seat_no"]))

    return {"booking_id": booking_id, "status": "CONFIRMED", "payment_status": "PAID", "amount": amount}


_MY_BOOKINGS_SQL = text(
    """
    SELECT
        b.id AS booking_id, b.booking_no, b.status,
        f.flight_no, f.origin, f.destination,
        fs.depart_at, fs.arrival_at,
        p.name AS passenger_name, s.seat_no,
        pay.amount AS payment_amount, pay.status AS payment_status
    FROM bookings b
    JOIN flight_schedules fs ON fs.id = b.schedule_id
    JOIN flights f ON f.id = fs.flight_id
    LEFT JOIN passengers p ON p.booking_id = b.id
    LEFT JOIN seats s ON s.id = p.seat_id
    LEFT JOIN payments pay ON pay.booking_id = b.id
    WHERE b.user_id = :user_id
    ORDER BY b.id DESC, p.id ASC
    """
)


@router.get("/bookings/me")
def list_my_bookings(current_user_id: int = Depends(get_current_user_id)):
    with engine.connect() as conn:
        rows = conn.execute(_MY_BOOKINGS_SQL, {"user_id": current_user_id}).mappings().all()

    bookings_by_id = {}
    order = []
    for row in rows:
        bid = row["booking_id"]
        if bid not in bookings_by_id:
            bookings_by_id[bid] = {
                "booking_id": bid,
                "booking_no": row["booking_no"],
                "status": row["status"],
                "flight_no": row["flight_no"],
                "origin": row["origin"],
                "destination": row["destination"],
                "depart_at": row["depart_at"],
                "arrival_at": row["arrival_at"],
                "payment_amount": row["payment_amount"],
                "payment_status": row["payment_status"],
                "passengers": [],
            }
            order.append(bid)
        if row["passenger_name"] is not None:
            bookings_by_id[bid]["passengers"].append(
                {"name": row["passenger_name"], "seat_no": row["seat_no"]}
            )

    return {"bookings": [bookings_by_id[bid] for bid in order]}


@router.patch("/bookings/{booking_id}/cancel")
def cancel_booking(booking_id: int, current_user_id: int = Depends(get_current_user_id)):
    with engine.begin() as conn:
        booking = conn.execute(
            text("SELECT id, user_id, status FROM bookings WHERE id = :id"),
            {"id": booking_id},
        ).mappings().first()
        if booking is None:
            raise _not_found(f"booking {booking_id} not found")
        if booking["user_id"] != current_user_id:
            raise _forbidden("this booking does not belong to the current user")
        if booking["status"] == "CANCELLED":
            return {"booking_id": booking_id, "status": "CANCELLED", "message": "already cancelled"}

        passengers = conn.execute(
            text(
                "SELECT p.seat_id, s.schedule_id, s.seat_no, s.status "
                "FROM passengers p JOIN seats s ON s.id = p.seat_id "
                "WHERE p.booking_id = :booking_id"
            ),
            {"booking_id": booking_id},
        ).mappings().all()

        # PASSENGERS.seat_id는 UNIQUE라, 행을 지워야 그 좌석이 다시 예약 가능한 상태로 돌아온다.
        conn.execute(text("DELETE FROM passengers WHERE booking_id = :id"), {"id": booking_id})

        for row in passengers:
            if row["status"] == "SOLD":
                conn.execute(
                    text("UPDATE seats SET status = 'AVAILABLE' WHERE id = :id"),
                    {"id": row["seat_id"]},
                )
            # 결제 전(PENDING) 취소라면 남아있는 선점도 즉시 반환한다.
            redis_client.delete(seat_hold_key(row["schedule_id"], row["seat_no"]))

        conn.execute(
            text("UPDATE bookings SET status = 'CANCELLED' WHERE id = :id"),
            {"id": booking_id},
        )

    return {"booking_id": booking_id, "status": "CANCELLED"}
