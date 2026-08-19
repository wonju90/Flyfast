import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import { translateError } from "../api/errorMessages";
import { getAirlineInfo } from "../utils/airline";
import { formatClock, formatDuration } from "../utils/dateTime";

function FlightCard({ f, mode, isSelected, onSelect, adults }) {
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
  if (!flights) return null;

  return (
    <section className="flight-list">
      <h2 className="section-title">{title}</h2>
      {flights.length === 0 ? (
        <div className="empty-state">
          <p>해당 조건의 항공편이 없습니다.</p>
          <p className="hint-text">다른 날짜를 선택하거나 홈에서 다시 검색해보세요.</p>
          <Link to="/" className="secondary-btn">
            홈으로 돌아가기
          </Link>
        </div>
      ) : (
        flights.map((f) => (
          <FlightCard
            key={f.schedule_id}
            f={f}
            mode={mode}
            isSelected={selectedId === f.schedule_id}
            onSelect={onSelect}
            adults={adults}
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

  return (
    <div className="page">
      <section className="route-hero">
        <p className="route-hero-title">
          {searchParams.get("origin")} <span aria-hidden="true">→</span>{" "}
          {searchParams.get("destination")}
        </p>
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
