import { useEffect, useState } from "react";
import { api } from "../api/client";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function pad2(n) {
  return String(n).padStart(2, "0");
}

function toDateStr(year, month, day) {
  return `${year}-${pad2(month + 1)}-${pad2(day)}`;
}

function formatManwon(amount) {
  return `${Math.round(amount / 10000)}만`;
}

// 왕복 귀국일까지 함께 보여주는 듀얼 달력(2단계)은 아직 없음 — 지금은 출발일 단일 달력만.
export default function PriceCalendar({ value, minDate, origin, destination, onSelect }) {
  const initial = new Date(value || minDate);
  const [viewYear, setViewYear] = useState(initial.getFullYear());
  const [viewMonth, setViewMonth] = useState(initial.getMonth());
  const [prices, setPrices] = useState({});
  const [loading, setLoading] = useState(false);

  const hasRoute = Boolean(origin) && Boolean(destination) && origin !== destination;

  useEffect(() => {
    if (!hasRoute) {
      setPrices({});
      return;
    }
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const start = toDateStr(viewYear, viewMonth, 1);
    const end = toDateStr(viewYear, viewMonth, daysInMonth);
    setLoading(true);
    api
      .priceCalendar({ origin, destination, start, end })
      .then((data) => setPrices(data.prices || {}))
      .catch(() => setPrices({}))
      .finally(() => setLoading(false));
  }, [hasRoute, origin, destination, viewYear, viewMonth]);

  function prevMonth() {
    if (viewMonth === 0) {
      setViewYear((y) => y - 1);
      setViewMonth(11);
    } else {
      setViewMonth((m) => m - 1);
    }
  }

  function nextMonth() {
    if (viewMonth === 11) {
      setViewYear((y) => y + 1);
      setViewMonth(0);
    } else {
      setViewMonth((m) => m + 1);
    }
  }

  const firstWeekday = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div className="calendar-popover">
      <div className="calendar-header">
        <button type="button" className="calendar-nav-btn" onClick={prevMonth} aria-label="이전 달">
          ‹
        </button>
        <span className="calendar-month-label">
          {viewYear}년 {viewMonth + 1}월
        </span>
        <button type="button" className="calendar-nav-btn" onClick={nextMonth} aria-label="다음 달">
          ›
        </button>
      </div>
      <div className="calendar-weekdays">
        {WEEKDAYS.map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>
      <div className="calendar-grid">
        {cells.map((d, idx) => {
          if (d === null) return <span key={`empty-${idx}`} className="calendar-day-empty" />;

          const dateStr = toDateStr(viewYear, viewMonth, d);
          const price = prices[dateStr];
          const isPast = dateStr < minDate;
          const noData = hasRoute && price == null;
          const disabled = isPast || noData;
          const isSelected = dateStr === value;

          return (
            <button
              key={dateStr}
              type="button"
              className={
                "calendar-day" +
                (isSelected ? " calendar-day-selected" : "") +
                (disabled ? " calendar-day-disabled" : "")
              }
              disabled={disabled}
              onClick={() => onSelect(dateStr)}
            >
              <span className="calendar-day-number">{d}</span>
              {hasRoute && price != null && (
                <span className="calendar-day-price">{formatManwon(price)}</span>
              )}
            </button>
          );
        })}
      </div>
      {!hasRoute && (
        <p className="calendar-hint">출발지·도착지를 선택하면 날짜별 요금이 표시됩니다.</p>
      )}
      {hasRoute && loading && <p className="calendar-hint">요금 불러오는 중...</p>}
    </div>
  );
}
