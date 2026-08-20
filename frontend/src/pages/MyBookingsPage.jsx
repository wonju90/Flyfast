import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { translateError } from "../api/errorMessages";
import { useAirportNames } from "../hooks/useAirportNames";
import { airportLabel } from "../utils/airport";
import { getAirlineInfo } from "../utils/airline";
import { formatTime } from "../utils/dateTime";

const STATUS_LABEL = {
  PENDING: "결제 대기",
  CONFIRMED: "확정",
};

function BookingCardSkeleton() {
  return (
    <div className="booking-card">
      <div className="booking-card-header">
        <div className="flight-card-airline">
          <span className="skeleton" style={{ width: 34, height: 34, borderRadius: 8 }} />
          <div className="flight-card-airline-text">
            <span className="skeleton" style={{ width: 64, height: 13 }} />
          </div>
        </div>
        <span className="skeleton" style={{ width: 52, height: 20, borderRadius: 12 }} />
      </div>
      <div className="skeleton" style={{ width: 140, height: 18, margin: "8px 0 6px" }} />
      <div className="skeleton" style={{ width: 180, height: 12 }} />
    </div>
  );
}

export default function MyBookingsPage() {
  const navigate = useNavigate();
  const [bookings, setBookings] = useState(null);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const airportNames = useAirportNames();

  const load = useCallback(() => {
    api
      .myBookings()
      .then((data) => setBookings(data.bookings))
      .catch((err) => setError(translateError(err)));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCancel(bookingId) {
    setBusyId(bookingId);
    try {
      await api.cancelBooking(bookingId);
      load();
    } catch (err) {
      setError(translateError(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="page">
      <section className="route-hero">
        <p className="route-hero-title">내 예약</p>
        {bookings && bookings.length > 0 && (
          <p className="route-hero-meta">총 {bookings.length}건</p>
        )}
      </section>

      {error && <p className="error-text">{error}</p>}
      {!bookings && !error && (
        <>
          <BookingCardSkeleton />
          <BookingCardSkeleton />
        </>
      )}
      {bookings && bookings.length === 0 && (
        <div className="empty-state">
          <p>예약 내역이 없습니다.</p>
          <Link to="/" className="primary-btn">
            항공편 검색하러 가기
          </Link>
        </div>
      )}

      {bookings &&
        bookings.map((b) => {
          const airline = getAirlineInfo(b.flight_no);
          const isPending = b.status === "PENDING";
          return (
            <div
              key={b.booking_id}
              className={"booking-card" + (isPending ? " booking-card-clickable" : "")}
              role={isPending ? "button" : undefined}
              tabIndex={isPending ? 0 : undefined}
              onClick={isPending ? () => navigate(`/bookings/${b.booking_id}/pay`) : undefined}
              onKeyDown={
                isPending
                  ? (e) => {
                      if (e.key === "Enter") navigate(`/bookings/${b.booking_id}/pay`);
                    }
                  : undefined
              }
            >
              {isPending && <p className="hint-text">결제하려면 카드를 클릭하세요</p>}
              <div className="booking-card-header">
                <div className="flight-card-airline">
                  <span className="airline-badge" style={{ background: airline.color }}>
                    {b.flight_no.slice(0, 2)}
                  </span>
                  <div className="flight-card-airline-text">
                    <span className="airline-name">{airline.name}</span>
                    <span className="flight-no">{b.flight_no}</span>
                  </div>
                </div>
                <span className={`status-badge status-${b.status.toLowerCase()}`}>
                  {STATUS_LABEL[b.status] || b.status}
                </span>
              </div>
              <p className="booking-card-route">
                {airportLabel(b.origin, airportNames)} <span aria-hidden="true">→</span>{" "}
                {airportLabel(b.destination, airportNames)}
              </p>
              <p className="hint-text">
                {formatTime(b.depart_at)} ~ {formatTime(b.arrival_at)}
              </p>
              <p className="booking-no">예약번호 {b.booking_no}</p>
              {b.passengers.length > 0 && (
                <p>탑승객: {b.passengers.map((p) => `${p.name}(${p.seat_no})`).join(", ")}</p>
              )}
              {b.payment_status && (
                <p>
                  결제: {b.payment_status}{" "}
                  {b.payment_amount != null && `· ${b.payment_amount.toLocaleString()}원`}
                </p>
              )}
              <button
                className="secondary-btn"
                disabled={busyId === b.booking_id}
                onClick={(e) => {
                  e.stopPropagation();
                  handleCancel(b.booking_id);
                }}
              >
                예약 취소
              </button>
            </div>
          );
        })}
    </div>
  );
}
