import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import { translateError } from "../api/errorMessages";

function formatTime(iso) {
  const d = new Date(iso);
  return d.toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function FlightCard({ f, mode, isSelected, onSelect }) {
  const content = (
    <>
      <div className="flight-card-main">
        <span className="flight-no">{f.flight_no}</span>
        <span className="flight-card-route">
          {f.origin} <span aria-hidden="true">→</span> {f.destination}
        </span>
      </div>
      <div className="flight-card-time">
        {formatTime(f.depart_at)} ~ {formatTime(f.arrival_at)}
      </div>
      <div className="flight-card-seats">
        잔여 {f.remaining_seats}석
        {f.remaining_seats === 0 && <span className="badge-full">매진</span>}
        {f.from_price != null && (
          <span className="from-price">{f.from_price.toLocaleString()}원부터</span>
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
    <Link to={`/flights/${f.schedule_id}`} className="flight-card">
      {content}
    </Link>
  );
}

function FlightList({ title, flights, mode, selectedId, onSelect }) {
  if (!flights) return null;

  return (
    <section className="flight-list">
      <h2 className="section-title">{title}</h2>
      {flights.length === 0 ? (
        <p className="empty-state">해당 조건의 항공편이 없습니다.</p>
      ) : (
        flights.map((f) => (
          <FlightCard
            key={f.schedule_id}
            f={f}
            mode={mode}
            isSelected={selectedId === f.schedule_id}
            onSelect={onSelect}
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
    navigate(`/flights/${selectedOutbound}?returnScheduleId=${selectedInbound}`);
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

      {loading && <p>불러오는 중...</p>}
      {error && <p className="error-text">{error}</p>}

      {result && (
        <>
          <FlightList
            title="가는 편"
            flights={result.outbound}
            mode={isRoundTrip ? "select" : "link"}
            selectedId={selectedOutbound}
            onSelect={setSelectedOutbound}
          />
          {result.inbound && (
            <FlightList
              title="오는 편"
              flights={result.inbound}
              mode="select"
              selectedId={selectedInbound}
              onSelect={setSelectedInbound}
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
