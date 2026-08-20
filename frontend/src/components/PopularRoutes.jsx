import { useEffect, useState } from "react";
import { api } from "../api/client";
import { airportLabel } from "../utils/airport";

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
        {routes.map((r) => (
          <button
            type="button"
            key={r.destination}
            className="popular-route-card"
            onClick={() => onSelect(r.destination)}
          >
            <span className="popular-route-city">{airportLabel(r.destination, airportNames)}</span>
            <span className="popular-route-price">{r.min_price.toLocaleString()}원부터</span>
          </button>
        ))}
      </div>
    </section>
  );
}
