import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import { translateError } from "../api/errorMessages";
import { useAuth } from "../context/AuthContext";
import { useAirportNames } from "../hooks/useAirportNames";
import { airportLabel } from "../utils/airport";
import { formatTime } from "../utils/dateTime";
import { TEST_CARD_FAIL, formatCardNumber } from "../utils/payment";
import { formatWon, formatManwon } from "../utils/price";
import { CABIN_LABELS, groupSeatsForMap } from "../utils/seatMap";

const HOLD_SECONDS = 600;

export default function FlightDetailPage() {
  const { scheduleId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnScheduleId = searchParams.get("returnScheduleId");
  const tripLeg = searchParams.get("tripLeg");
  const adults = Math.max(1, Number(searchParams.get("adults")) || 1);
  const airportNames = useAirportNames();

  const [flight, setFlight] = useState(null);
  const [error, setError] = useState(null);
  const [selectedSeats, setSelectedSeats] = useState([]);

  // step: browsing | held | booked | confirmed
  const [step, setStep] = useState("browsing");
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [passengerNames, setPassengerNames] = useState({});
  const [booking, setBooking] = useState(null);
  const [paymentResult, setPaymentResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [cardNumber, setCardNumber] = useState("");
  const [cardError, setCardError] = useState(null);

  const loadFlight = useCallback(() => {
    api
      .flightDetail(scheduleId)
      .then(setFlight)
      .catch((err) => setError(translateError(err)));
  }, [scheduleId]);

  useEffect(() => {
    loadFlight();
  }, [loadFlight]);

  // 왕복에서 가는 편 -> 오는 편으로 넘어갈 때도 같은 컴포넌트가 재사용되고 scheduleId만
  // 바뀐다. 이 상태를 초기화하지 않으면 가는 편에서 남은 step="confirmed" 등이 그대로
  // 이어져서, 오는 편 좌석을 실제로 선택/예약/결제하지 않았는데도 확정 화면이 떠버린다.
  useEffect(() => {
    setError(null);
    setSelectedSeats([]);
    setStep("browsing");
    setSecondsLeft(0);
    setPassengerNames({});
    setBooking(null);
    setPaymentResult(null);
    setCardNumber("");
    setCardError(null);
  }, [scheduleId]);

  useEffect(() => {
    if (step !== "held") return undefined;
    const timer = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setError("좌석 선점 시간이 만료되었습니다. 좌석을 다시 선택해주세요.");
          backToSeatSelection();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  function selectSeat(seatNo, status) {
    if (status !== "AVAILABLE") return;
    setError(null);
    if (selectedSeats.includes(seatNo)) {
      setSelectedSeats(selectedSeats.filter((s) => s !== seatNo));
      return;
    }
    if (selectedSeats.length >= adults) {
      setError(`좌석은 인원 수만큼(최대 ${adults}석) 선택할 수 있습니다.`);
      return;
    }
    setSelectedSeats([...selectedSeats, seatNo]);
  }

  async function handleHold() {
    if (!user) {
      navigate("/login");
      return;
    }
    if (selectedSeats.length === 0) {
      setError("좌석을 먼저 선택해주세요.");
      return;
    }
    setError(null);
    setBusy(true);

    const held = [];
    let failedSeat = null;
    let holdError = null;
    for (const seatNo of selectedSeats) {
      try {
        await api.holdSeat(scheduleId, seatNo);
        held.push(seatNo);
      } catch (err) {
        failedSeat = seatNo;
        holdError = err;
        break;
      }
    }

    if (holdError) {
      // 이미 선점한 좌석이 있다면, 일부만 잡힌 채로 남지 않도록 전부 반환한다.
      await Promise.allSettled(held.map((s) => api.releaseSeat(scheduleId, s)));
      setError(
        held.length > 0
          ? `${failedSeat} 좌석 선점에 실패해 이미 선점한 좌석도 함께 취소했습니다 — ${translateError(holdError)}`
          : translateError(holdError)
      );
      setSelectedSeats([]);
      loadFlight();
      setBusy(false);
      return;
    }

    setPassengerNames(Object.fromEntries(selectedSeats.map((s) => [s, ""])));
    setSecondsLeft(HOLD_SECONDS);
    setStep("held");
    setBusy(false);
  }

  async function handleReleaseHold() {
    setBusy(true);
    await Promise.allSettled(selectedSeats.map((s) => api.releaseSeat(scheduleId, s)));
    setBusy(false);
    backToSeatSelection();
  }

  function backToSeatSelection() {
    setStep("browsing");
    setSelectedSeats([]);
    setBooking(null);
    setPassengerNames({});
    loadFlight();
  }

  async function handleCreateBooking(e) {
    e.preventDefault();
    const missing = selectedSeats.filter((seatNo) => !passengerNames[seatNo]?.trim());
    if (missing.length > 0) {
      setError("모든 탑승객의 이름을 입력해주세요.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const result = await api.createBooking({
        schedule_id: Number(scheduleId),
        passengers: selectedSeats.map((seatNo) => ({
          seat_no: seatNo,
          name: passengerNames[seatNo].trim(),
        })),
      });
      setBooking(result);
      setStep("booked");
    } catch (err) {
      if (err.code === "HOLD_EXPIRED") {
        // 로컬 카운트다운이 0이 되길 기다리지 않고 서버 판정을 즉시 반영한다 —
        // 안 그러면 만료된 hold로 계속 예약 생성을 재시도하는 죽은 화면이 된다.
        setError("좌석 선점 시간이 만료되었습니다. 좌석을 다시 선택해주세요.");
        backToSeatSelection();
      } else {
        setError(translateError(err));
      }
    } finally {
      setBusy(false);
    }
  }

  async function handlePay(simulate) {
    setError(null);
    setBusy(true);
    try {
      const result = await api.payBooking(booking.booking_id, simulate);
      setPaymentResult(result);
      if (result.payment_status === "PAID") {
        setStep("confirmed");
        loadFlight();
      }
    } catch (err) {
      if (err.code === "HOLD_EXPIRED") {
        // 예약 생성과 결제 사이에 hold가 끊긴 경우 — 이 예약은 다시는 결제될 수 없으므로
        // (같은 에러만 무한 반복) 예약을 취소해 좌석을 반환하고 처음부터 다시 고르게 한다.
        setError("결제 전에 좌석 선점이 만료되어 이 예약은 진행할 수 없습니다. 예약을 취소하고 좌석을 다시 선택해주세요.");
        try {
          await api.cancelBooking(booking.booking_id);
        } catch {
          // 이미 다른 경로로 정리됐어도 무방 — 아래에서 어차피 초기 상태로 되돌린다.
        }
        backToSeatSelection();
      } else {
        setError(translateError(err));
      }
    } finally {
      setBusy(false);
    }
  }

  function handleCardSubmit(e) {
    e.preventDefault();
    const digits = cardNumber.replace(/\D/g, "");
    if (digits.length !== 16) {
      setCardError("카드번호 16자리를 입력해주세요.");
      return;
    }
    setCardError(null);
    handlePay(digits === TEST_CARD_FAIL ? "fail" : "success");
  }

  if (error && !flight) {
    return (
      <div className="page">
        <p className="error-text">{error}</p>
      </div>
    );
  }

  if (!flight) {
    return (
      <div className="page">
        <section className="route-hero route-hero-skeleton">
          <div className="skeleton" style={{ width: 180, height: 20, margin: "0 auto 10px" }} />
          <div className="skeleton" style={{ width: 240, height: 14, margin: "0 auto" }} />
        </section>
        <div className="seat-map">
          <span className="seat-map-nose" aria-hidden="true" />
          {[0, 1].map((section) => (
            <div key={section} className="cabin-section">
              <div className="skeleton" style={{ width: 96, height: 12, margin: "0 auto 10px" }} />
              {[0, 1, 2].map((row) => (
                <div key={row} className="seat-row">
                  {[0, 1, 2].map((seat) => (
                    <span
                      key={seat}
                      className="skeleton"
                      style={{ width: 56, height: 50, borderRadius: "10px 10px 4px 4px" }}
                    />
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <section className="route-hero">
        {returnScheduleId && (
          <span className="trip-progress-badge">왕복 1/2 · 가는 편</span>
        )}
        {tripLeg === "return" && (
          <span className="trip-progress-badge">왕복 2/2 · 오는 편</span>
        )}
        <p className="route-hero-title">
          <span className="route-hero-flightno">{flight.flight_no}</span>
          {airportLabel(flight.origin, airportNames)} <span aria-hidden="true">→</span>{" "}
          {airportLabel(flight.destination, airportNames)}
        </p>
        <p className="route-hero-meta">
          {formatTime(flight.depart_at)} ~ {formatTime(flight.arrival_at)} · 잔여{" "}
          {flight.remaining_seats}석{adults > 1 ? ` · 성인 ${adults}명` : ""}
        </p>
      </section>

      {error && <p className="error-text">{error}</p>}

      {step === "browsing" && flight.remaining_seats < adults && (
        <p className="error-text">
          잔여 좌석({flight.remaining_seats}석)이 인원 수({adults}명)보다 적습니다. 인원을 줄이거나
          다른 항공편을 선택해주세요.
        </p>
      )}

      {step === "browsing" && (
        <>
          <div className="seat-map">
            <span className="seat-map-nose" aria-hidden="true" />
            {groupSeatsForMap(flight.seats).map(({ seatClass, rows }) => (
              <div key={seatClass} className={`cabin-section cabin-${seatClass.toLowerCase()}`}>
                <p className="cabin-label">{CABIN_LABELS[seatClass] ?? seatClass}</p>
                {rows.map((rowSeats, rowIdx) => {
                  const aisleAt = rowSeats.length >= 4 ? Math.ceil(rowSeats.length / 2) : null;
                  return (
                    <div key={rowIdx} className="seat-row">
                      {rowSeats.flatMap((s, seatIdx) => {
                        const nodes = [];
                        if (aisleAt !== null && seatIdx === aisleAt) {
                          nodes.push(<span key={`aisle-${rowIdx}`} className="seat-aisle" />);
                        }
                        nodes.push(
                          <button
                            key={s.seat_no}
                            className={
                              "seat" +
                              (s.status !== "AVAILABLE" ? " seat-sold" : "") +
                              (selectedSeats.includes(s.seat_no) ? " seat-selected" : "")
                            }
                            disabled={s.status !== "AVAILABLE"}
                            title={`${s.seat_class} · ${formatWon(s.fare)}`}
                            onClick={() => selectSeat(s.seat_no, s.status)}
                          >
                            <span className="seat-no">{s.seat_no}</span>
                            <span className="seat-fare">{formatManwon(s.fare)}</span>
                          </button>
                        );
                        return nodes;
                      })}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          <p className="hint-text">
            버튼 위에 마우스를 올리면 좌석 클래스와 요금을 볼 수 있습니다.
            {adults > 1 && ` 인원 ${adults}명 — 좌석 ${selectedSeats.length}/${adults}석 선택됨.`}
          </p>
          {!user && <p className="hint-text">좌석을 선점하려면 로그인이 필요합니다.</p>}
          <button
            className="primary-btn"
            disabled={selectedSeats.length === 0 || busy}
            onClick={handleHold}
          >
            {selectedSeats.length > 0
              ? `${selectedSeats.join(", ")} 좌석 10분 선점하기` +
                (adults > 1 ? ` (${selectedSeats.length}/${adults}명)` : "")
              : adults > 1
                ? `좌석을 선택하세요 (${adults}명)`
                : "좌석을 선택하세요"}
          </button>
        </>
      )}

      {step === "held" && (
        <div className="hold-panel">
          <p>
            <strong>{selectedSeats.join(", ")}</strong> 좌석 {selectedSeats.length}석을
            선점했습니다. 남은 시간:{" "}
            <strong>
              {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")}
            </strong>
          </p>
          <form onSubmit={handleCreateBooking}>
            {selectedSeats.map((seatNo) => (
              <label key={seatNo}>
                {seatNo} 탑승객 이름
                <input
                  value={passengerNames[seatNo] || ""}
                  onChange={(e) =>
                    setPassengerNames((prev) => ({ ...prev, [seatNo]: e.target.value }))
                  }
                />
              </label>
            ))}
            <div className="button-row">
              <button type="submit" className="primary-btn" disabled={busy}>
                예약 생성
              </button>
              <button type="button" className="secondary-btn" onClick={handleReleaseHold} disabled={busy}>
                선점 취소
              </button>
            </div>
          </form>
        </div>
      )}

      {step === "booked" && booking && (
        <div className="payment-panel">
          <p>
            예약번호 <strong>{booking.booking_no}</strong> 생성됨 (결제 대기)
          </p>
          <p className="hint-text">
            탑승객: {booking.passengers.map((p) => `${p.name}(${p.seat_no})`).join(", ")}
          </p>
          <p className="payment-amount">결제 금액: {formatWon(booking.amount)}</p>
          <p className="hint-text">
            요금은 좌석 클래스 기준으로 서버가 계산한 금액입니다. 실제 PG 연동 없이 Mock으로
            처리되며, 아래 테스트 카드번호로 성공/실패를 재현할 수 있습니다.
          </p>
          <form className="mock-card-form" onSubmit={handleCardSubmit}>
            <label>
              카드번호
              <input
                inputMode="numeric"
                placeholder="4242 4242 4242 4242"
                value={formatCardNumber(cardNumber)}
                onChange={(e) => {
                  setCardError(null);
                  setCardNumber(e.target.value);
                }}
              />
            </label>
            <p className="hint-text">
              테스트 카드: <strong>4242 4242 4242 4242</strong>(성공 처리되는 임의의 16자리) ·{" "}
              <strong>0000 0000 0000 0000</strong>(실패 재현용)
            </p>
            {cardError && <p className="error-text">{cardError}</p>}
            <button type="submit" className="primary-btn" disabled={busy}>
              결제하기
            </button>
          </form>
          {paymentResult && paymentResult.payment_status === "FAILED" && (
            <p className="error-text">결제 실패 — 선점이 유지되는 동안 다시 시도할 수 있습니다.</p>
          )}
        </div>
      )}

      {step === "confirmed" && (
        <div className="confirm-panel">
          <p>
            {returnScheduleId
              ? "가는 편 예약이 확정되었습니다. 🎉 이어서 오는 편도 예약해주세요."
              : tripLeg === "return"
                ? "오는 편까지 예약이 확정되어 왕복 예약이 모두 끝났습니다. 🎉"
                : "예약이 확정되었습니다. 🎉"}
          </p>
          <div className="button-row">
            {returnScheduleId && (
              <Link
                className="primary-btn"
                to={`/flights/${returnScheduleId}?tripLeg=return&adults=${adults}`}
              >
                다음: 오는 편 좌석 선택하기
              </Link>
            )}
            <Link className={returnScheduleId ? "secondary-btn" : "primary-btn"} to="/bookings">
              내 예약 보기
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
