from typing import Optional

from fastapi import APIRouter, Query
from sqlalchemy import text

from app.db import engine

router = APIRouter(prefix="/api/v1", tags=["airports"])

# ERD(4.1)에는 별도 AIRPORTS 테이블이 없다 — 실제 운항 노선(flights.origin/destination)에
# 존재하는 코드만 검색 대상으로 삼는다. 이름은 잘 알려진 IATA 코드의 참고용 표시일 뿐,
# DB에 저장된 데이터가 아니라 매핑에 없는 코드는 코드 자체를 이름으로 대신 보여준다.
_IATA_NAMES = {
    "ICN": "인천",
    "NRT": "도쿄(나리타)",
    "HND": "도쿄(하네다)",
    "LAX": "로스앤젤레스",
    "JFK": "뉴욕(JFK)",
    "CDG": "파리(샤를 드골)",
    "FRA": "프랑크푸르트",
    "SIN": "싱가포르",
    "BKK": "방콕",
    "HKG": "홍콩",
}


@router.get("/airports")
def search_airports(q: Optional[str] = Query(None)):
    with engine.connect() as conn:
        rows = conn.execute(
            text("SELECT origin AS code FROM flights UNION SELECT destination FROM flights")
        ).all()

    codes = sorted({row[0] for row in rows})

    if q:
        needle = q.strip().upper()
        codes = [c for c in codes if needle in c or needle in _IATA_NAMES.get(c, "")]

    return {"airports": [{"code": c, "name": _IATA_NAMES.get(c, c)} for c in codes]}
