import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import AirportPicker from "../components/AirportPicker";
import ApiServerBanner from "../components/ApiServerBanner";
import PopularRoutes from "../components/PopularRoutes";
import PriceCalendar from "../components/PriceCalendar";
import { useAuth } from "../context/AuthContext";
import { todayStr } from "../utils/dateTime";
import { formatManwon } from "../utils/price";

function cheapestCombo(departPrices, returnPrices) {
  let best = null;
  for (const [d, dPrice] of Object.entries(departPrices)) {
    for (const [r, rPrice] of Object.entries(returnPrices)) {
      if (r <= d) continue;
      const total = dPrice + rPrice;
      if (!best || total < best.total) best = { depart: d, return: r, total };
    }
  }
  return best;
}

export default function SearchPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const displayName = user?.name || null;
  const [airports, setAirports] = useState([]);
  const airportNames = useMemo(
    () => Object.fromEntries(airports.map((a) => [a.code, a.name])),
    [airports]
  );
  const [tripType, setTripType] = useState("oneway"); // "oneway" | "roundtrip"
  const [form, setForm] = useState({
    origin: "ICN",
    destination: "NRT",
    depart: "",
    returnDate: "",
    adults: 1,
    direct: true,
  });
  const [error, setError] = useState(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [departPrices, setDepartPrices] = useState({});
  const [returnPrices, setReturnPrices] = useState({});
  const departFieldRef = useRef(null);

  const bestCombo = useMemo(
    () => cheapestCombo(departPrices, returnPrices),
    [departPrices, returnPrices]
  );

  useEffect(() => {
    if (!calendarOpen) return undefined;
    function handleClickOutside(e) {
      if (departFieldRef.current && !departFieldRef.current.contains(e.target)) {
        setCalendarOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [calendarOpen]);

  function selectTripType(next) {
    setTripType(next);
    setCalendarOpen(false);
    if (next === "oneway") {
      update("returnDate", "");
    }
  }

  function updateDepart(value) {
    setForm((prev) => ({
      ...prev,
      depart: value,
      // 출발일을 귀국일보다 늦게 바꾸면 조합이 깨지므로 귀국일을 같이 초기화한다.
      returnDate: prev.returnDate && prev.returnDate < value ? "" : prev.returnDate,
    }));
  }

  useEffect(() => {
    api
      .searchAirports()
      .then((data) => setAirports(data.airports))
      .catch(() => setAirports([]));
  }, []);

  function update(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function swap() {
    setForm((prev) => ({ ...prev, origin: prev.destination, destination: prev.origin }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    if (!form.origin || !form.destination) {
      setError("출발지와 도착지를 입력해주세요.");
      return;
    }
    if (form.origin === form.destination) {
      setError("출발지와 도착지는 달라야 합니다.");
      return;
    }
    if (!form.depart) {
      setError("출발일을 선택해주세요.");
      return;
    }
    if (form.depart < todayStr()) {
      setError("출발일은 오늘 이후로 선택해주세요.");
      return;
    }
    if (tripType === "roundtrip") {
      if (!form.returnDate) {
        setError("귀국일을 선택해주세요.");
        return;
      }
      if (form.returnDate < form.depart) {
        setError("귀국일은 출발일보다 늦어야 합니다.");
        return;
      }
    }

    const params = new URLSearchParams({
      origin: form.origin,
      destination: form.destination,
      depart: form.depart,
      adults: String(form.adults),
      direct: String(form.direct),
    });
    if (tripType === "roundtrip" && form.returnDate) params.set("return", form.returnDate);

    navigate(`/results?${params.toString()}`);
  }

  return (
    <div className="page-home">
      <section className="hero">
        <div className="hero-inner">
          <h1 className="hero-title">
            {displayName ? `${displayName}님, 어디로 떠나볼까요?` : "어디로 떠나볼까요?"}
          </h1>
          <p className="hero-subtitle">
            실시간 좌석 선점으로 빠르고 안전하게 항공권을 예약하세요.
          </p>
          <form className="search-form hero-search-card" onSubmit={handleSubmit}>
            <div className="trip-type-toggle" role="group" aria-label="편도/왕복 선택">
              <button
                type="button"
                className={tripType === "oneway" ? "trip-type-btn active" : "trip-type-btn"}
                onClick={() => selectTripType("oneway")}
              >
                편도
              </button>
              <button
                type="button"
                className={tripType === "roundtrip" ? "trip-type-btn active" : "trip-type-btn"}
                onClick={() => selectTripType("roundtrip")}
              >
                왕복
              </button>
            </div>

            <div className="search-row">
              <AirportPicker
                label="출발지"
                value={form.origin}
                airports={airports}
                onSelect={(code) => update("origin", code)}
                placeholder="출발지 선택"
              />
              <button
                type="button"
                className="swap-btn"
                onClick={swap}
                aria-label="출발지/도착지 교환"
              >
                ⇄
              </button>
              <AirportPicker
                label="도착지"
                value={form.destination}
                airports={airports}
                onSelect={(code) => update("destination", code)}
                placeholder="도착지 선택"
              />
            </div>

            <div className="search-row">
              {tripType === "oneway" ? (
                <label>
                  출발일
                  <div className="date-field" ref={departFieldRef}>
                    <button
                      type="button"
                      className="date-trigger"
                      onClick={() => setCalendarOpen((prev) => !prev)}
                    >
                      {form.depart || "날짜 선택"}
                    </button>
                    {calendarOpen && (
                      <PriceCalendar
                        value={form.depart}
                        minDate={todayStr()}
                        origin={form.origin}
                        destination={form.destination}
                        onSelect={(d) => {
                          updateDepart(d);
                          setCalendarOpen(false);
                        }}
                      />
                    )}
                  </div>
                </label>
              ) : (
                <div className="date-field date-field-dual" ref={departFieldRef}>
                  <div className="dual-date-triggers">
                    <label>
                      출발일
                      <button type="button" className="date-trigger" onClick={() => setCalendarOpen(true)}>
                        {form.depart || "날짜 선택"}
                      </button>
                    </label>
                    <label>
                      귀국일
                      <button type="button" className="date-trigger" onClick={() => setCalendarOpen(true)}>
                        {form.returnDate || "날짜 선택"}
                      </button>
                    </label>
                  </div>
                  {calendarOpen && (
                    <div className="calendar-popover calendar-popover-dual">
                      <p className="calendar-status">
                        가는날 <strong>{form.depart || "미선택"}</strong> · 오는날{" "}
                        <strong>{form.returnDate || "미선택"}</strong>
                      </p>
                      {bestCombo && (
                        <button
                          type="button"
                          className="best-combo-btn"
                          onClick={() => {
                            updateDepart(bestCombo.depart);
                            update("returnDate", bestCombo.return);
                          }}
                        >
                          💡 최저가 조합 {bestCombo.depart} → {bestCombo.return} ·{" "}
                          <strong>{formatManwon(bestCombo.total)}원</strong>
                        </button>
                      )}
                      <div className="dual-month-grids">
                        <PriceCalendar
                          variant="inline"
                          label="가는날"
                          value={form.depart}
                          minDate={todayStr()}
                          origin={form.origin}
                          destination={form.destination}
                          onSelect={(d) => updateDepart(d)}
                          onPricesLoaded={setDepartPrices}
                        />
                        <PriceCalendar
                          variant="inline"
                          label="오는날"
                          value={form.returnDate}
                          minDate={form.depart || todayStr()}
                          origin={form.destination}
                          destination={form.origin}
                          onSelect={(d) => update("returnDate", d)}
                          onPricesLoaded={setReturnPrices}
                        />
                      </div>
                      <button
                        type="button"
                        className="secondary-btn calendar-apply-btn"
                        onClick={() => setCalendarOpen(false)}
                      >
                        적용
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="search-row">
              <label>
                인원
                <input
                  type="number"
                  min="1"
                  max="9"
                  value={form.adults}
                  onChange={(e) => update("adults", Number(e.target.value))}
                />
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={form.direct}
                  onChange={(e) => update("direct", e.target.checked)}
                />
                직항만
              </label>
            </div>

            {error && <p className="error-text">{error}</p>}

            <button type="submit" className="primary-btn">
              항공편 검색
            </button>
          </form>
        </div>
      </section>

      <div className="page">
        <PopularRoutes
          origin={form.origin}
          airportNames={airportNames}
          onSelect={(code) => update("destination", code)}
        />

        <section className="home-features">
          <div className="feature-item">
            <p className="feature-title">실시간 좌석 선점</p>
            <p className="feature-desc">
              좌석을 고르면 10분간 자리를 잡아두어, 결제하는 동안 다른 사용자가 같은 좌석을
              가져갈 수 없습니다.
            </p>
          </div>
          <div className="feature-item">
            <p className="feature-title">투명한 가격 계산</p>
            <p className="feature-desc">
              결제 금액은 좌석 등급별 요금표를 기준으로 서버가 직접 계산해서 안내합니다.
            </p>
          </div>
          <div className="feature-item">
            <p className="feature-title">빠른 예약 확인</p>
            <p className="feature-desc">
              예약, 결제, 취소까지 마이페이지에서 바로 확인하고 처리할 수 있습니다.
            </p>
          </div>
        </section>

        <ApiServerBanner />
      </div>
    </div>
  );
}
