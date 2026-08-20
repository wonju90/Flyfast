import { useEffect, useState } from "react";
import { api } from "../api/client";
import { addDays, formatShortDate, todayStr } from "../utils/dateTime";
import { formatManwon } from "../utils/price";

const OFFSETS = [-3, -2, -1, 0, 1, 2, 3];

// 왕복이면 가는날을 옮길 때 여행 기간(오는날-가는날)을 그대로 유지한 채 오는날도 같이 옮겨서,
// 옮긴 날짜 조합의 왕복 총액(가는 편+오는 편 각각의 그 날짜 최저가 합)을 보여준다.
export default function DateShiftStrip({ origin, destination, depart, returnDate, onSelect }) {
  const [outboundPrices, setOutboundPrices] = useState({});
  const [inboundPrices, setInboundPrices] = useState({});

  const tripDuration = returnDate
    ? Math.round((new Date(returnDate) - new Date(depart)) / 86400000)
    : null;

  useEffect(() => {
    api
      .priceCalendar({ origin, destination, start: addDays(depart, -3), end: addDays(depart, 3) })
      .then((data) => setOutboundPrices(data.prices || {}))
      .catch(() => setOutboundPrices({}));
  }, [origin, destination, depart]);

  useEffect(() => {
    if (!returnDate) {
      setInboundPrices({});
      return;
    }
    api
      .priceCalendar({
        origin: destination,
        destination: origin,
        start: addDays(returnDate, -3),
        end: addDays(returnDate, 3),
      })
      .then((data) => setInboundPrices(data.prices || {}))
      .catch(() => setInboundPrices({}));
  }, [origin, destination, returnDate]);

  const today = todayStr();

  const cells = OFFSETS.map((offset) => {
    const date = addDays(depart, offset);
    const shiftedReturn = tripDuration != null ? addDays(date, tripDuration) : null;
    const outPrice = outboundPrices[date];
    const inPrice = shiftedReturn ? inboundPrices[shiftedReturn] : null;
    const total = shiftedReturn ? (outPrice != null && inPrice != null ? outPrice + inPrice : null) : outPrice;
    const disabled = date < today || total == null;
    return { offset, date, returnDate: shiftedReturn, total, disabled };
  });

  const validTotals = cells.filter((c) => !c.disabled).map((c) => c.total);
  const minTotal = validTotals.length > 0 ? Math.min(...validTotals) : null;

  return (
    <div className="date-shift-strip">
      {cells.map((c) => (
        <button
          key={c.offset}
          type="button"
          className={
            "date-shift-cell" +
            (c.offset === 0 ? " date-shift-current" : "") +
            (c.disabled ? " date-shift-disabled" : "") +
            (!c.disabled && c.total === minTotal ? " date-shift-cheapest" : "")
          }
          disabled={c.disabled}
          onClick={() => onSelect(c.date, c.returnDate)}
        >
          <span className="date-shift-label">{formatShortDate(c.date)}</span>
          <span className="date-shift-price">{c.total != null ? `${formatManwon(c.total)}원` : "-"}</span>
        </button>
      ))}
    </div>
  );
}
