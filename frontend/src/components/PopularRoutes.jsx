import { useEffect, useState } from "react";
import { api } from "../api/client";
import { airportLabel } from "../utils/airport";

// 실제 도시 이미지 없이도 카드마다 구분되는 색을 주기 위해, 목적지 코드로 고정된 색상을
// 뽑아낸다 — 같은 도시는 항상 같은 색이 나오고 외부 이미지 호스팅도 필요 없다.
function hueForCode(code) {
  let hash = 0;
  for (let i = 0; i < code.length; i++) hash = (hash * 31 + code.charCodeAt(i)) % 360;
  return hash;
}

export default function PopularRoutes({ origin, airportNames, onSelect }) {
  const [routes, setRoutes] = useState(null);

  useEffect(() => {
    if (!origin) return;
    api
      .popularRoutes(origin)
      .then((data) => setRoutes(data.routes || []))
      .catch(() => setRoutes([]));
  }, [origin]);

  if (!routes || routes.length === 0) return null;

  return (
    <section className="popular-routes">
      <h2 className="section-title">{airportLabel(origin, airportNames)}발 인기 노선</h2>
      <div className="popular-routes-grid">
        {routes.map((r) => {
          const hue = hueForCode(r.destination);
          return (
            <button
              type="button"
              key={r.destination}
              className="popular-route-card"
              onClick={() => onSelect(r.destination)}
            >
              <span
                className="popular-route-thumb"
                aria-hidden="true"
                style={{
                  background: `linear-gradient(135deg, hsl(${hue}, 65%, 55%), hsl(${(hue + 40) % 360}, 70%, 38%))`,
                }}
              >
                ✈️
              </span>
              <span className="popular-route-text">
                <span className="popular-route-city">{airportLabel(r.destination, airportNames)}</span>
                <span className="popular-route-price">{r.min_price.toLocaleString()}원부터</span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
