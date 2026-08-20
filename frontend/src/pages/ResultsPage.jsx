import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import { translateError } from "../api/errorMessages";
import { useAirportNames } from "../hooks/useAirportNames";
import { airportLabel } from "../utils/airport";
import { getAirlineInfo } from "../utils/airline";
import { formatClock, formatDuration } from "../utils/dateTime";

function FlightCard({ f, mode, isSelected, onSelect, adults, isCheapest }) {
  const airline = getAirlineInfo(f.flight_no);
  const isFull = f.remaining_seats === 0;
  const isLow = !isFull && f.remaining_seats < 10;

  const content = (
    <>
      <div className="flight-card-airline">
        <span className="airline-badge" style={{ background: airline.color }}>
          {f.flight_no.slice(0, 2)}
        </span>
        <div className="flight-card-airline-text">
          <span className="airline-name">{airline.name}</span>
          <span className="flight-no">{f.flight_no}</span>
        </div>
      </div>

      <div className="flight-card-timeline">
        <div className="flight-card-timepoint">
          <span className="flight-card-clock">{formatClock(f.depart_at)}</span>
          <span className="flight-card-airport">{f.origin}</span>
        </div>
        <div className="flight-card-duration">
          <span className="duration-text">{formatDuration(f.depart_at, f.arrival_at)}</span>
          <span className="duration-line" aria-hidden="true" />
          <span className="duration-direct">직항</span>
        </div>
        <div className="flight-card-timepoint">
          <span className="flight-card-clock">{formatClock(f.arrival_at)}</span>
          <span className="flight-card-airport">{f.destination}</span>
        </div>
      </div>

      <div className="flight-card-price-col">
        {isFull && <span className="badge-full">매진</span>}
        {isLow && <span className="badge-low">{f.remaining_seats}석 남음</span>}
        {isCheapest && !isFull && <span className="badge-cheapest">최저가</span>}
        {f.from_price != null && (
          <span className="flight-card-price">
            {f.from_price.toLocaleString()}원<small>부터</small>
          </span>
        )}
      </div>
    </>
  );

  if (mode === "select") {
    return (
      <button
        type="button"
        className={"flight-card flight-card-selectable" + (isSelected ? " flight-card-selected" : "")}
        disabled={f.remaining_seats === 0}
        onClick={() => onSelect(f.schedule_id)}
      >
        {content}
      </button>
    );
  }

  return (
    <Link to={`/flights/${f.schedule_id}?adults=${adults}`} className="flight-card">
      {content}
    </Link>
  );
}

function FlightCardSkeleton() {
  return (
    <div className="flight-card flight-card-skeleton">
      <div className="flight-card-airline">
        <span className="skeleton" style={{ width: 34, height: 34, borderRadius: 8 }} />
        <div className="flight-card-airline-text">
          <span className="skeleton" style={{ width: 64, height: 13 }} />
          <span className="skeleton" style={{ width: 44, height: 11, marginTop: 4 }} />
        </div>
      </div>
      <div className="flight-card-timeline">
        <div className="skeleton" style={{ width: 48, height: 22 }} />
        <div className="skeleton" style={{ width: 70, height: 14 }} />
        <div className="skeleton" style={{ width: 48, height: 22 }} />
      </div>
      <div className="flight-card-price-col">
        <div className="skeleton" style={{ width: 84, height: 20 }} />
      </div>
    </div>
  );
}

function cheapestFlight(flights) {
  if (!flights) return null;
  const candidates = flights.filter((f) => f.remaining_seats > 0 && f.from_price != null);
  if (candidates.length === 0) return null;
  return candidates.reduce((best, f) => (f.from_price < best.from_price ? f : best));
}

function FlightListSkeleton({ title }) {
  return (
    <section className="flight-list">
      <h2 className="section-title">{title}</h2>
      <FlightCardSkeleton />
      <FlightCardSkeleton />
      <FlightCardSkeleton />
    </section>
  );
}

function FlightList({ title, flights, mode, selectedId, onSelect, adults }) {
  const [sortBy, setSortBy] = useState("time"); // "time" | "price"

  if (!flights) return null;

  const pricedFlights = flights.filter((f) => f.from_price != null);
  const cheapestPrice = pricedFlights.length > 1 ? Math.min(...pricedFlights.map((f) => f.from_price)) : null;

  const displayFlights =
    sortBy === "price" ? [...flights].sort((a, b) => (a.from_price ?? Infinity) - (b.from_price ?? Infinity)) : flights;

  return (
    <section className="flight-list">
      <div className="flight-list-header">
        <h2 className="section-title">{title}</h2>
        {flights.length > 1 && (
          <div className="trip-type-toggle" role="group" aria-label="정렬 기준">
            <button
              type="button"
              className={sortBy === "time" ? "trip-type-btn active" : "trip-type-btn"}
              onClick={() => setSortBy("time")}
            >
              출발시간순
            </button>
            <button
              type="button"
              className={sortBy === "price" ? "trip-type-btn active" : "trip-type-btn"}
              onClick={() => setSortBy("price")}
            >
              가격낮은순
            </button>
          </div>
        )}
      </div>
      {flights.length === 0 ? (
        <div className="empty-state">
          <p>해당 조건의 항공편이 없습니다.</p>
          <p className="hint-text">다른 날짜를 선택하거나 홈에서 다시 검색해보세요.</p>
          <Link to="/" className="secondary-btn">
            홈으로 돌아가기
          </Link>
        </div>
      ) : (
        displayFlights.map((f) => (
          <FlightCard
            key={f.schedule_id}
            f={f}
            mode={mode}
            isSelected={selectedId === f.schedule_id}
            onSelect={onSelect}
            adults={adults}
            isCheapest={cheapestPrice != null && f.from_price === cheapestPrice}
          />
        ))
      )}
    </section>
  );
}

export default function ResultsPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedOutbound, setSelectedOutbound] = useState(null);
  const [selectedInbound, setSelectedInbound] = useState(null);

  const isRoundTrip = !!searchParams.get("return");
  const adults = Math.max(1, Number(searchParams.get("adults")) || 1);
  const airportNames = useAirportNames();

  useEffect(() => {
    setLoading(true);
    setError(null);
    setSelectedOutbound(null);
    setSelectedInbound(null);
    api
      .searchFlights(Object.fromEntries(searchParams))
      .then(setResult)
      .catch((err) => setError(translateError(err)))
      .finally(() => setLoading(false));
  }, [searchParams]);

  function handleContinue() {
    navigate(`/flights/${selectedOutbound}?returnScheduleId=${selectedInbound}&adults=${adults}`);
  }

  const bestCombo = useMemo(() => {
    if (!result || !isRoundTrip) return null;
    const outbound = cheapestFlight(result.outbound);
    const inbound = cheapestFlight(result.inbound);
    if (!outbound || !inbound) return null;
    return { outbound, inbound, total: outbound.from_price + inbound.from_price };
  }, [result, isRoundTrip]);

  function selectBestCombo() {
    setSelectedOutbound(bestCombo.outbound.schedule_id);
    setSelectedInbound(bestCombo.inbound.schedule_id);
  }

  async function toggleFavorite() {
    const next = !result.is_favorite;
    setResult((prev) => ({ ...prev, is_favorite: next }));
    try {
      await api.setSearchFavorite(result.history_id, next);
    } catch {
      setResult((prev) => ({ ...prev, is_favorite: !next }));
    }
  }

  return (
    <div className="page">
      <section className="route-hero">
        <div className="route-hero-title-row">
          <p className="route-hero-title">
            {airportLabel(searchParams.get("origin"), airportNames)}{" "}
            <span aria-hidden="true">→</span>{" "}
            {airportLabel(searchParams.get("destination"), airportNames)}
          </p>
          {result && result.history_id != null && (
            <button
              type="button"
              className={"favorite-star-btn" + (result.is_favorite ? " favorite-star-active" : "")}
              onClick={toggleFavorite}
              aria-pressed={result.is_favorite}
              aria-label={result.is_favorite ? "즐겨찾기 해제" : "즐겨찾기 추가"}
            >
              {result.is_favorite ? "★" : "☆"}
            </button>
          )}
        </div>
        <p className="route-hero-meta">
          {searchParams.get("depart")}
          {isRoundTrip ? ` · 귀국 ${searchParams.get("return")}` : ""} · 성인{" "}
          {searchParams.get("adults")}명
        </p>
      </section>

      {isRoundTrip && (
        <p className="hint-text">
          왕복은 가는 편과 오는 편을 각각 예약·결제합니다 (예약 2건). 아래에서 두 편을 먼저 선택해주세요.
        </p>
      )}

      {loading && (
        <>
          <FlightListSkeleton title="가는 편" />
          {isRoundTrip && <FlightListSkeleton title="오는 편" />}
        </>
      )}
      {error && <p className="error-text">{error}</p>}

      {result && (
        <>
          {bestCombo && (
            <button type="button" className="best-combo-btn" onClick={selectBestCombo}>
              💡 최저가 조합 {bestCombo.outbound.flight_no} {formatClock(bestCombo.outbound.depart_at)} 출발 +{" "}
              {bestCombo.inbound.flight_no} {formatClock(bestCombo.inbound.depart_at)} 출발 ·{" "}
              <strong>총 {bestCombo.total.toLocaleString()}원</strong>
            </button>
          )}
          <FlightList
            title="가는 편"
            flights={result.outbound}
            mode={isRoundTrip ? "select" : "link"}
            selectedId={selectedOutbound}
            onSelect={setSelectedOutbound}
            adults={adults}
          />
          {result.inbound && (
            <FlightList
              title="오는 편"
              flights={result.inbound}
              mode="select"
              selectedId={selectedInbound}
              onSelect={setSelectedInbound}
              adults={adults}
            />
          )}

          {isRoundTrip && (
            <div className="round-trip-bar">
              <span>가는 편: {selectedOutbound ? "선택됨" : "미선택"}</span>
              <span>오는 편: {selectedInbound ? "선택됨" : "미선택"}</span>
              <button
                className="primary-btn"
                disabled={!selectedOutbound || !selectedInbound}
                onClick={handleContinue}
              >
                다음: 가는 편 좌석 선택하기
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
