from sqlalchemy import text

from app.redis_client import redis_client

# 4.3절 Redis 키 설계: fare:{scheduleId}:{class}, TTL 1분 — "외부 운임 API 호출 제한" 목적의 캐시.
# 실시간 항공사 운임 API 연동은 범위 밖(1.3절)이라, 여기서는 자체 fares 테이블 조회를 캐싱한다.
FARE_CACHE_TTL_SECONDS = 60


def _fare_cache_key(schedule_id: int, seat_class: str) -> str:
    return f"fare:{schedule_id}:{seat_class}"


def get_fare(conn, schedule_id: int, seat_class: str) -> int:
    cache_key = _fare_cache_key(schedule_id, seat_class)
    cached = redis_client.get(cache_key)
    if cached is not None:
        return int(cached)

    row = conn.execute(
        text(
            "SELECT amount FROM fares WHERE schedule_id = :schedule_id AND seat_class = :seat_class"
        ),
        {"schedule_id": schedule_id, "seat_class": seat_class},
    ).mappings().first()
    if row is None:
        raise ValueError(f"no fare configured for schedule {schedule_id} class {seat_class}")

    amount = row["amount"]
    redis_client.set(cache_key, amount, ex=FARE_CACHE_TTL_SECONDS)
    return amount
