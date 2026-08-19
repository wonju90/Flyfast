from typing import Optional

from fastapi import APIRouter, Query
from sqlalchemy import text

from app.db import engine

router = APIRouter(prefix="/api/v1", tags=["airports"])

# ERD(4.1)에는 별도 AIRPORTS 테이블이 없다 — 실제 운항 노선(flights.origin/destination)에
# 존재하는 코드만 검색 대상으로 삼는다. 이름/대륙은 잘 알려진 IATA 코드의 참고용 표시일 뿐,
# DB에 저장된 데이터가 아니라 매핑에 없는 코드는 코드 자체를 이름으로, 대륙은 "기타"로 대신한다.
_IATA_INFO = {
    "ICN": {"name": "인천", "continent": "아시아"},
    "NRT": {"name": "도쿄(나리타)", "continent": "아시아"},
    "HND": {"name": "도쿄(하네다)", "continent": "아시아"},
    "SIN": {"name": "싱가포르", "continent": "아시아"},
    "BKK": {"name": "방콕", "continent": "아시아"},
    "HKG": {"name": "홍콩", "continent": "아시아"},
    "CDG": {"name": "파리(샤를 드골)", "continent": "유럽"},
    "FRA": {"name": "프랑크푸르트", "continent": "유럽"},
    "LAX": {"name": "로스앤젤레스", "continent": "북미"},
    "JFK": {"name": "뉴욕(JFK)", "continent": "북미"},
}
_DEFAULT_CONTINENT = "기타"


@router.get("/airports")
def search_airports(q: Optional[str] = Query(None)):
    with engine.connect() as conn:
        rows = conn.execute(
            text("SELECT origin AS code FROM flights UNION SELECT destination FROM flights")
        ).all()

    codes = sorted({row[0] for row in rows})

    if q:
        needle = q.strip().upper()
        codes = [
            c for c in codes if needle in c or needle in _IATA_INFO.get(c, {}).get("name", "")
        ]

    return {
        "airports": [
            {
                "code": c,
                "name": _IATA_INFO.get(c, {}).get("name", c),
                "continent": _IATA_INFO.get(c, {}).get("continent", _DEFAULT_CONTINENT),
            }
            for c in codes
        ]
    }
