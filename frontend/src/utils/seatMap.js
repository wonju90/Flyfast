export const CABIN_ORDER = ["FIRST", "BUSINESS", "ECONOMY"];
export const CABIN_LABELS = {
  FIRST: "퍼스트 클래스",
  BUSINESS: "비즈니스 클래스",
  ECONOMY: "이코노미 클래스",
};

// 좌석 목록을 실제 비행기처럼 클래스(캐빈) -> 행(row) -> 열(A,B,C...) 순서로 묶는다.
export function groupSeatsForMap(seats) {
  const byClass = {};
  for (const s of seats) {
    (byClass[s.seat_class] ??= []).push(s);
  }

  const classes = Object.keys(byClass).sort((a, b) => {
    const ia = CABIN_ORDER.indexOf(a);
    const ib = CABIN_ORDER.indexOf(b);
    return (ia === -1 ? CABIN_ORDER.length : ia) - (ib === -1 ? CABIN_ORDER.length : ib);
  });

  return classes.map((seatClass) => {
    const byRow = {};
    for (const s of byClass[seatClass]) {
      const rowNo = Number(s.seat_no.match(/^\d+/)?.[0] ?? 0);
      (byRow[rowNo] ??= []).push(s);
    }
    const rows = Object.keys(byRow)
      .map(Number)
      .sort((a, b) => a - b)
      .map((rowNo) => byRow[rowNo].slice().sort((a, b) => a.seat_no.localeCompare(b.seat_no)));

    return { seatClass, rows };
  });
}
