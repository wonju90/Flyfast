import { useEffect, useState } from "react";
import { api } from "../api/client";
import { addDays, formatShortDate, todayStr } from "../utils/dateTime";
import { formatManwon } from "../utils/price";

const OFFSETS = [-3, -2, -1, 0, 1, 2, 3];

function cheapestTotal(cells) {
  const totals = cells.filter((c) => !c.disabled).map((c) => c.total);
  return totals.length > 0 ? Math.min(...totals) : null;
}

function DateShiftRow({ label, cells, onSelect }) {
  const minTotal = cheapestTotal(cells);

  return (
    <div className="date-shift-group">
      {label && <p className="date-shift-group-label">{label}</p>}
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
            onClick={() => onSelect(c.date)}
          >
            <span className="date-shift-label">{formatShortDate(c.date)}</span>
            <span className="date-shift-price">{c.total != null ? `${formatManwon(c.total)}원` : "-"}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// 왕복이면 가는날/오는날을 각각 독립적으로 옮길 수 있게 두 줄로 보여준다 — 가는날 스트립은
// 오는날을 고정한 채 가는날만, 오는날 스트립은 가는날을 고정한 채 오는날만 바꿔서, 여행
// 기간 자체도 늘리거나 줄일 수 있다 (기존처럼 기간을 고정해 통째로 미는 방식이 아님).
export default function DateShiftStrip({ origin, destination, depart, returnDate, onSelect }) {
  const [outboundPrices, setOutboundPrices] = useState({});
  const [inboundPrices, setInboundPrices] = useState({});

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

  if (!returnDate) {
    const cells = OFFSETS.map((offset) => {
      const date = addDays(depart, offset);
      const total = outboundPrices[date];
      const disabled = date < today || total == null;
      return { offset, date, total, disabled };
    });
    return <DateShiftRow cells={cells} onSelect={(date) => onSelect(date, null)} />;
  }

  const departCells = OFFSETS.map((offset) => {
    const date = addDays(depart, offset);
    const invalidOrder = date < today || date >= returnDate;
    const outPrice = outboundPrices[date];
    const inPrice = inboundPrices[returnDate];
    const total = !invalidOrder && outPrice != null && inPrice != null ? outPrice + inPrice : null;
    return { offset, date, total, disabled: invalidOrder || total == null };
  });

  const returnCells = OFFSETS.map((offset) => {
    const date = addDays(returnDate, offset);
    const invalidOrder = date <= depart;
    const outPrice = outboundPrices[depart];
    const inPrice = inboundPrices[date];
    const total = !invalidOrder && outPrice != null && inPrice != null ? outPrice + inPrice : null;
    return { offset, date, total, disabled: invalidOrder || total == null };
  });

  return (
    <>
      <DateShiftRow label="가는날" cells={departCells} onSelect={(date) => onSelect(date, returnDate)} />
      <DateShiftRow label="오는날" cells={returnCells} onSelect={(date) => onSelect(depart, date)} />
    </>
  );
}
