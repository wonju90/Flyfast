import { useCallback, useEffect, useState } from "react";
import { api } from "../api/client";
import { translateError } from "../api/errorMessages";

function formatTime(iso) {
  return new Date(iso).toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const STATUS_LABEL = {
  PENDING: "결제 대기",
  CONFIRMED: "확정",
  CANCELLED: "취소됨",
};

export default function MyBookingsPage() {
  const [bookings, setBookings] = useState(null);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);

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
      <h1>내 예약</h1>
      {error && <p className="error-text">{error}</p>}
      {!bookings && !error && <p>불러오는 중...</p>}
      {bookings && bookings.length === 0 && <p className="empty-state">예약 내역이 없습니다.</p>}

      {bookings &&
        bookings.map((b) => (
          <div key={b.booking_id} className="booking-card">
            <div className="booking-card-header">
              <span className="flight-no">{b.flight_no}</span>
              <span className={`status-badge status-${b.status.toLowerCase()}`}>
                {STATUS_LABEL[b.status] || b.status}
              </span>
            </div>
            <p>
              {b.origin} → {b.destination} · {formatTime(b.depart_at)} ~ {formatTime(b.arrival_at)}
            </p>
            <p className="booking-no">예약번호 {b.booking_no}</p>
            {b.passengers.length > 0 && (
              <p>
                탑승객:{" "}
                {b.passengers.map((p) => `${p.name}(${p.seat_no})`).join(", ")}
              </p>
            )}
            {b.payment_status && (
              <p>
                결제: {b.payment_status} {b.payment_amount != null && `· ${b.payment_amount.toLocaleString()}원`}
              </p>
            )}
            {b.status !== "CANCELLED" && (
              <button
                className="secondary-btn"
                disabled={busyId === b.booking_id}
                onClick={() => handleCancel(b.booking_id)}
              >
                예약 취소
              </button>
            )}
          </div>
        ))}
    </div>
  );
}
