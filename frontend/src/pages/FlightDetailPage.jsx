import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import { translateError } from "../api/errorMessages";
import { useAuth } from "../context/AuthContext";

const HOLD_SECONDS = 600;

function formatTime(iso) {
  return new Date(iso).toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatWon(amount) {
  return amount == null ? "-" : `${amount.toLocaleString()}원`;
}

function formatManwon(amount) {
  return amount == null ? "" : `${Math.round(amount / 10000)}만`;
}

const CABIN_ORDER = ["FIRST", "BUSINESS", "ECONOMY"];
const CABIN_LABELS = { FIRST: "퍼스트 클래스", BUSINESS: "비즈니스 클래스", ECONOMY: "이코노미 클래스" };

// 좌석 목록을 실제 비행기처럼 클래스(캐빈) -> 행(row) -> 열(A,B,C...) 순서로 묶는다.
function groupSeatsForMap(seats) {
  const byClass = {};
  for (const s of seats) {
    (byClass[s.seat_class] ??= []).push(s);
  }

  const classes = Object.keys(byClass).sort((a, b) => {
    const ia = CABIN_ORDER.indexOf(a);
    const ib = CABIN_ORDER.indexOf(b);
    return (ia === -1 ? CABIN_ORDER.length : ia) - (ib === -1 ? CABIN_ORDER.length : ib);
  });

  return classes.map((seatClass) => {
    const byRow = {};
    for (const s of byClass[seatClass]) {
      const rowNo = Number(s.seat_no.match(/^\d+/)?.[0] ?? 0);
      (byRow[rowNo] ??= []).push(s);
    }
    const rows = Object.keys(byRow)
      .map(Number)
      .sort((a, b) => a - b)
      .map((rowNo) => byRow[rowNo].slice().sort((a, b) => a.seat_no.localeCompare(b.seat_no)));

    return { seatClass, rows };
  });
}

export default function FlightDetailPage() {
  const { scheduleId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnScheduleId = searchParams.get("returnScheduleId");
  const tripLeg = searchParams.get("tripLeg");

  const [flight, setFlight] = useState(null);
  const [error, setError] = useState(null);
  const [selectedSeat, setSelectedSeat] = useState(null);

  // step: browsing | held | booked | confirmed
  const [step, setStep] = useState("browsing");
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [passengerName, setPassengerName] = useState("");
  const [booking, setBooking] = useState(null);
  const [paymentResult, setPaymentResult] = useState(null);
  const [busy, setBusy] = useState(false);

  const loadFlight = useCallback(() => {
    api
      .flightDetail(scheduleId)
      .then(setFlight)
      .catch((err) => setError(translateError(err)));
  }, [scheduleId]);

  useEffect(() => {
    loadFlight();
  }, [loadFlight]);

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
    setSelectedSeat(seatNo);
    setError(null);
  }

  async function handleHold() {
    if (!user) {
      navigate("/login");
      return;
    }
    if (!selectedSeat) {
      setError("좌석을 먼저 선택해주세요.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await api.holdSeat(scheduleId, selectedSeat);
      setSecondsLeft(HOLD_SECONDS);
      setStep("held");
    } catch (err) {
      setError(translateError(err));
      loadFlight();
    } finally {
      setBusy(false);
    }
  }

  async function handleReleaseHold() {
    setBusy(true);
    try {
      await api.releaseSeat(scheduleId, selectedSeat);
    } catch {
      // 이미 만료됐을 수 있음 — 무시하고 초기화
    } finally {
      setBusy(false);
      backToSeatSelection();
    }
  }

  function backToSeatSelection() {
    setStep("browsing");
    setSelectedSeat(null);
    setBooking(null);
    setPassengerName("");
    loadFlight();
  }

  async function handleCreateBooking(e) {
    e.preventDefault();
    if (!passengerName.trim()) {
      setError("탑승객 이름을 입력해주세요.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const result = await api.createBooking({
        schedule_id: Number(scheduleId),
        passengers: [{ seat_no: selectedSeat, name: passengerName.trim() }],
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
        <p>불러오는 중...</p>
      </div>
    );
  }

  return (
    <div className="page">
      {returnScheduleId && (
        <span className="trip-progress-badge">왕복 1/2 · 가는 편</span>
      )}
      {tripLeg === "return" && (
        <span className="trip-progress-badge">왕복 2/2 · 오는 편</span>
      )}
      <h1>
        {flight.flight_no} · {flight.origin} → {flight.destination}
      </h1>
      <p className="flight-detail-time">
        {formatTime(flight.depart_at)} ~ {formatTime(flight.arrival_at)} · 잔여 {flight.remaining_seats}석
      </p>

      {error && <p className="error-text">{error}</p>}

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
                              (selectedSeat === s.seat_no ? " seat-selected" : "")
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
          <p className="hint-text">버튼 위에 마우스를 올리면 좌석 클래스와 요금을 볼 수 있습니다.</p>
          {!user && <p className="hint-text">좌석을 선점하려면 로그인이 필요합니다.</p>}
          <button className="primary-btn" disabled={!selectedSeat || busy} onClick={handleHold}>
            {selectedSeat ? `${selectedSeat} 좌석 10분 선점하기` : "좌석을 선택하세요"}
          </button>
        </>
      )}

      {step === "held" && (
        <div className="hold-panel">
          <p>
            <strong>{selectedSeat}</strong> 좌석을 선점했습니다. 남은 시간:{" "}
            <strong>
              {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")}
            </strong>
          </p>
          <form onSubmit={handleCreateBooking}>
            <label>
              탑승객 이름
              <input value={passengerName} onChange={(e) => setPassengerName(e.target.value)} />
            </label>
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
          <p className="payment-amount">결제 금액: {formatWon(booking.amount)}</p>
          <p className="hint-text">
            요금은 좌석 클래스 기준으로 서버가 계산한 금액입니다. 결제는 Mock 처리입니다 — 실제 PG
            연동 없이 성공/실패를 시뮬레이션합니다.
          </p>
          <div className="button-row">
            <button className="primary-btn" disabled={busy} onClick={() => handlePay("success")}>
              결제 성공 시뮬레이션
            </button>
            <button className="secondary-btn" disabled={busy} onClick={() => handlePay("fail")}>
              결제 실패 시뮬레이션
            </button>
          </div>
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
              <Link className="primary-btn" to={`/flights/${returnScheduleId}?tripLeg=return`}>
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
