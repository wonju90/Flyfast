def seat_hold_key(schedule_id: int, seat_no: str) -> str:
    return f"seat:hold:{schedule_id}:{seat_no}"
