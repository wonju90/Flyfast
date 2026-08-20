import { useEffect, useRef, useState } from "react";

const CONTINENT_ORDER = ["아시아", "유럽", "북미", "기타"];

function groupByContinent(airports) {
  const grouped = {};
  for (const a of airports) {
    (grouped[a.continent] ??= []).push(a);
  }
  const continents = Object.keys(grouped).sort((a, b) => {
    const ia = CONTINENT_ORDER.indexOf(a);
    const ib = CONTINENT_ORDER.indexOf(b);
    return (ia === -1 ? CONTINENT_ORDER.length : ia) - (ib === -1 ? CONTINENT_ORDER.length : ib);
  });
  return continents.map((continent) => ({ continent, airports: grouped[continent] }));
}

export default function AirportPicker({ label, icon, value, airports, onSelect, placeholder }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    function handleClickOutside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const selected = airports.find((a) => a.code === value);
  const groups = groupByContinent(airports);

  return (
    <div className="airport-field" ref={wrapRef}>
      <label>
        <span className="field-label-text">
          {icon && <span className="field-icon" aria-hidden="true">{icon}</span>}
          {label}
        </span>
        <button type="button" className="date-trigger" onClick={() => setOpen((prev) => !prev)}>
          {selected ? selected.name : value || placeholder}
        </button>
      </label>
      {open && (
        <div className="airport-popover">
          {groups.length === 0 && <p className="calendar-hint">불러오는 중...</p>}
          {groups.map(({ continent, airports: list }) => (
            <div key={continent} className="airport-continent-group">
              <p className="airport-continent-label">{continent}</p>
              <div className="airport-city-grid">
                {list.map((a) => (
                  <button
                    key={a.code}
                    type="button"
                    className={
                      "airport-city-btn" + (a.code === value ? " airport-city-selected" : "")
                    }
                    onClick={() => {
                      onSelect(a.code);
                      setOpen(false);
                    }}
                  >
                    {a.name}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
