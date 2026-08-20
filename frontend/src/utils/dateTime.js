export function pad2(n) {
  return String(n).padStart(2, "0");
}

export function toDateStr(year, month, day) {
  return `${year}-${pad2(month + 1)}-${pad2(day)}`;
}

export function todayStr() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 10);
}

export function formatTime(iso) {
  return new Date(iso).toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatClock(iso) {
  return new Date(iso).toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function formatDuration(departIso, arrivalIso) {
  const mins = Math.round((new Date(arrivalIso) - new Date(departIso)) / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h <= 0) return `${m}분`;
  if (m === 0) return `${h}시간`;
  return `${h}시간 ${m}분`;
}

function parseDateStr(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(dateStr, delta) {
  const dt = parseDateStr(dateStr);
  dt.setDate(dt.getDate() + delta);
  return toDateStr(dt.getFullYear(), dt.getMonth(), dt.getDate());
}

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

export function formatShortDate(dateStr) {
  const dt = parseDateStr(dateStr);
  return `${dt.getMonth() + 1}/${dt.getDate()}(${WEEKDAY_LABELS[dt.getDay()]})`;
}
