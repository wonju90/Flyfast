import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client";
import { translateError } from "../api/errorMessages";
import { useAirportNames } from "../hooks/useAirportNames";
import { airportLabel } from "../utils/airport";
import { getAirlineInfo } from "../utils/airline";
import { formatTime } from "../utils/dateTime";
import { TEST_CARD_FAIL, formatCardNumber } from "../utils/payment";
import { formatWon } from "../utils/price";

const STATUS_MESSAGE = {
  CONFIRMED: "이미 결제가 완료되어 확정된 예약입니다.",
  CANCELLED: "이미 취소된 예약입니다.",
};

export default function BookingPaymentPage() {
  const { bookingId } = useParams();
  const airportNames = useAirportNames();

  const [booking, setBooking] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [cardNumber, setCardNumber] = useState("");
  const [cardError, setCardError] = useState(null);
  const [paymentResult, setPaymentResult] = useState(null);

  const load = useCallback(() => {
    api
      .getBooking(bookingId)
      .then(setBooking)
      .catch((err) => setError(translateError(err)));
  }, [bookingId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCardSubmit(e) {
    e.preventDefault();
    const digits = cardNumber.replace(/\D/g, "");
    if (digits.length !== 16) {
      setCardError("카드번호 16자리를 입력해주세요.");
      return;
    }
    setCardError(null);
    setError(null);
    setBusy(true);
    try {
      const result = await api.payBooking(bookingId, digits === TEST_CARD_FAIL ? "fail" : "success");
      setPaymentResult(result);
    } catch (err) {
      if (err.code === "HOLD_EXPIRED") {
        try {
          await api.cancelBooking(bookingId);
        } catch {
          // 이미 다른 경로로 정리됐어도 무방 — 아래 메시지가 최종 상태를 안내한다.
        }
        setError("결제 전 좌석 선점이 만료되어 이 예약은 취소되었습니다. 다시 검색해서 예약해주세요.");
        setBooking((prev) => (prev ? { ...prev, status: "CANCELLED" } : prev));
      } else {
        setError(translateError(err));
      }
    } finally {
      setBusy(false);
    }
  }

  if (error && !booking) {
    return (
      <div className="page">
        <p className="error-text">{error}</p>
        <Link to="/bookings" className="secondary-btn">
          내 예약으로 돌아가기
        </Link>
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="page">
        <div className="skeleton" style={{ width: 200, height: 24, marginBottom: 12 }} />
        <div className="skeleton" style={{ width: 320, height: 100 }} />
      </div>
    );
  }

  const airline = getAirlineInfo(booking.flight_no);
  const confirmed = paymentResult && paymentResult.payment_status === "PAID";
  const isPending = booking.status === "PENDING" && !confirmed;

  return (
    <div className="page">
      <section className="route-hero">
        <p className="route-hero-title">
          <span className="route-hero-flightno">{booking.flight_no}</span>
          {airportLabel(booking.origin, airportNames)} <span aria-hidden="true">→</span>{" "}
          {airportLabel(booking.destination, airportNames)}
        </p>
        <p className="route-hero-meta">
          {formatTime(booking.depart_at)} ~ {formatTime(booking.arrival_at)}
        </p>
      </section>

      {error && <p className="error-text">{error}</p>}

      {confirmed && (
        <div className="confirm-panel">
          <p>결제가 완료되어 예약이 확정되었습니다. 🎉</p>
          <Link to="/bookings" className="primary-btn">
            내 예약으로 돌아가기
          </Link>
        </div>
      )}

      {!confirmed && !isPending && (
        <div className="payment-panel">
          <p>{STATUS_MESSAGE[booking.status] || `이 예약은 처리할 수 없는 상태입니다 (${booking.status}).`}</p>
          <Link to="/bookings" className="secondary-btn">
            내 예약으로 돌아가기
          </Link>
        </div>
      )}

      {isPending && (
        <div className="payment-panel">
          <div className="flight-card-airline">
            <span className="airline-badge" style={{ background: airline.color }}>
              {booking.flight_no.slice(0, 2)}
            </span>
            <div className="flight-card-airline-text">
              <span className="airline-name">{airline.name}</span>
              <span className="flight-no">{booking.flight_no}</span>
            </div>
          </div>
          <p>
            예약번호 <strong>{booking.booking_no}</strong> (결제 대기)
          </p>
          <p className="hint-text">
            탑승객: {booking.passengers.map((p) => `${p.name}(${p.seat_no})`).join(", ")}
          </p>
          <p className="payment-amount">결제 금액: {formatWon(booking.amount)}</p>
          <p className="hint-text">
            실제 PG 연동 없이 Mock으로 처리되며, 아래 테스트 카드번호로 성공/실패를 재현할 수
            있습니다.
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
    </div>
  );
}
